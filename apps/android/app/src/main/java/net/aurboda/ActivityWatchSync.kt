package net.aurboda

import android.content.Context
import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.*
import java.security.MessageDigest
import java.time.Instant

private const val AW_URL = "http://127.0.0.1:5600"
private val awImportMutex = Mutex()

fun activityWatchScope(context: Context): String? = CredentialsManager.getCredentials(context)?.let {
  MessageDigest.getInstance("SHA-256").digest("${it.apiUrl.trimEnd('/')}|${it.username}".toByteArray()).joinToString("") { b -> "%02x".format(b) }
}
private fun awPrefs(context: Context) = context.getSharedPreferences("ActivityWatchSyncV2", Context.MODE_PRIVATE)
fun isActivityWatchSyncEnabled(context: Context): Boolean = activityWatchScope(context)?.let { awPrefs(context).getBoolean("$it.enabled", false) } ?: false
fun setActivityWatchSyncEnabled(context: Context, enabled: Boolean) {
  val scope = activityWatchScope(context) ?: return
  awPrefs(context).edit().putBoolean("$scope.enabled", enabled).apply()
  if (enabled) { ActivityWatchWorker.schedule(context); ActivityWatchWorker.enqueue(context) }
  else ActivityWatchWorker.cancel(context)
}

@Serializable
data class AwEvent(val timestamp: String, val duration: Double, val data: JsonObject, val id: Long? = null)
@Serializable
data class AwBucket(val type: String = "", val hostname: String = "", val created: String = "")
@Serializable
data class AurbodaAwEvent(val app: String, val duration: Double, val timestamp: String, val title: String? = null,
  val bucket_id: String? = null, val source_event_id: String? = null, val source_data: JsonObject? = null, val category: String? = null, val source_instance: String? = null)
@Serializable
data class AurbodaAwSyncBody(val device_name: String, val events: List<AurbodaAwEvent>, val is_mobile: Boolean = true)
@Serializable
data class AurbodaAwSyncResponse(val success: Boolean, val result: AurbodaAwSyncResult? = null, val error: String? = null, @Transient val stop: SyncStop? = null)
@Serializable
data class AurbodaAwSyncResult(val status: String, val records_stored: Int, val device_name: String, val error: String? = null,
  val events_total: Int? = null, val earliest_event: String? = null, val latest_event: String? = null)
@Serializable
data class ActivityWatchSyncResult(val available: Boolean = false, val bucketsFound: Int = 0, val eventsFetched: Int = 0,
  val eventsPushed: Int = 0, val error: String? = null, @Transient val stop: SyncStop? = null,
  val lastAttempt: String? = null, val lastSuccess: String? = null, val earliest: String? = null, val latest: String? = null,
  val progress: String = "Not yet synchronized", val running: Boolean = false, val retryable: Boolean = true)

fun loadActivityWatchStatus(context: Context): ActivityWatchSyncResult {
  val scope = activityWatchScope(context) ?: return ActivityWatchSyncResult()
  return awPrefs(context).getString("$scope.status", null)?.let { runCatching { appJson.decodeFromString<ActivityWatchSyncResult>(it) }.getOrNull() } ?: ActivityWatchSyncResult()
}

fun activityWatchLocalClient() = HttpClient(Android) {
  followRedirects = false
  install(HttpTimeout) { connectTimeoutMillis = 3000; socketTimeoutMillis = 15000; requestTimeoutMillis = 30000 }
}

class AwSyncException(message: String, val retryable: Boolean = true) : Exception(message)

suspend fun awGet(client: HttpClient, path: List<String>, key: String, parameters: Map<String, String> = emptyMap()): String {
  val response = client.get(AW_URL) {
    url { appendPathSegments(listOf("api", "0") + path, encodeSlash = true); parameters.forEach { (k, v) -> this.parameters.append(k, v) } }
    if (key.isNotBlank()) header(HttpHeaders.Authorization, "Bearer $key")
  }
  when (response.status.value) {
    200 -> return response.bodyAsText()
    401, 403 -> throw AwSyncException("ActivityWatch requires its own API key. In ActivityWatch open Settings → API authentication, copy the key, then save it here. Keep authentication enabled.", false)
    404 -> throw AwSyncException("ActivityWatch endpoint or bucket is unavailable. Update ActivityWatch, open it, then retry. Your import checkpoint is preserved.", false)
    else -> throw AwSyncException("ActivityWatch returned HTTP ${response.status.value}. Open ActivityWatch and retry.")
  }
}

data class AwPage(val events: List<AwEvent>, val nextEnd: String?)

/** ActivityWatch returns newest first and clips durations at query bounds. Never split a timestamp tie. */
suspend fun readAwPage(end: String?, fetch: suspend (String?, Int) -> List<AwEvent>, hydrate: suspend (Long) -> AwEvent): AwPage {
  var limit = 501
  while (true) {
    val events = fetch(end, limit)
    events.forEach { require(it.duration.isFinite() && it.duration >= 0 && it.data["app"]?.jsonPrimitive?.contentOrNull?.isNotBlank() == true) { "Invalid ActivityWatch event; checkpoint retained" }; Instant.parse(it.timestamp) }
    val oldest = events.minOfOrNull { Instant.parse(it.timestamp) }
    val full = events.size >= limit
    val selected = if (full) events.filter { Instant.parse(it.timestamp) > oldest } else events
    if (full && selected.isEmpty()) {
      if (limit >= 32064) throw AwSyncException("Too many events share one timestamp. Export this bucket for a manual import; no events were skipped.", false)
      limit *= 2
      continue
    }
    val boundary = end?.let(Instant::parse)
    val originals = selected.map { event ->
      if (boundary != null && Instant.parse(event.timestamp).plusNanos((event.duration * 1e9).toLong()) >= boundary) {
        val original = hydrate(event.id ?: throw AwSyncException("ActivityWatch did not supply event IDs needed to preserve original durations. Update ActivityWatch and retry.", false))
        require(original.id == event.id && original.timestamp.let(Instant::parse) == event.timestamp.let(Instant::parse)) { "ActivityWatch changed during import; retry" }
        original
      } else event
    }
    return AwPage(originals, if (full) oldest.toString() else null)
  }
}

suspend fun pushEventsToAurboda(httpClient: HttpClient, apiUrl: String, authToken: String, events: List<AurbodaAwEvent>, deviceName: String, isMobile: Boolean = true): AurbodaAwSyncResponse {
  val response = httpClient.post("${apiUrl.trimEnd('/')}/sync/activitywatch") {
    contentType(ContentType.Application.Json)
    header(HttpHeaders.Authorization, "Bearer $authToken")
    setBody(AurbodaAwSyncBody(device_name = deviceName, events = events, is_mobile = isMobile))
  }
  if (response.status != HttpStatusCode.OK) {
    val error = httpErrorOf(response)
    return AurbodaAwSyncResponse(false, error = "Aurboda returned HTTP ${response.status.value}. Check your connection and sign-in, then retry.", stop = error.syncStop())
  }
  val result = appJson.decodeFromString<AurbodaAwSyncResponse>(response.bodyAsText())
  if (!result.success || result.result?.status != "success" || result.result.records_stored != events.size || result.result.events_total == null) {
    throw AwSyncException("Aurboda did not confirm the complete batch. Update the server and retry; the checkpoint has not advanced.")
  }
  return result
}

suspend fun processActivityWatchSync(apiUrl: String, authToken: String, httpClient: HttpClient, context: Context, backfill: Boolean = false, localClient: HttpClient? = null): ActivityWatchSyncResult = awImportMutex.withLock {
  val credentials = CredentialsManager.getCredentials(context) ?: return@withLock ActivityWatchSyncResult(error = "Sign in to Aurboda first.", retryable = false)
  if (credentials.apiUrl != apiUrl || credentials.authToken != authToken) return@withLock ActivityWatchSyncResult(error = "Account changed. Retry from the current account.", retryable = false)
  val scope = activityWatchScope(context)!!
  val prefs = awPrefs(context)
  fun stillCurrent() = activityWatchScope(context) == scope && CredentialsManager.getCredentials(context)?.authToken == authToken && isActivityWatchSyncEnabled(context)
  fun guard() { if (!stillCurrent()) throw CancellationException("ActivityWatch account or opt-in changed") }
  var status = loadActivityWatchStatus(context).copy(lastAttempt = Instant.now().toString(), running = true, error = null)
  fun save() { guard(); check(prefs.edit().putString("$scope.status", appJson.encodeToString(ActivityWatchSyncResult.serializer(), status)).commit()) }
  save()
  val local = localClient ?: activityWatchLocalClient()
  val upload = httpClient.config { followRedirects = false }
  try {
    if (backfill || prefs.contains("$scope.backfill_requested")) {
      guard()
      val reset = prefs.edit()
      prefs.all.keys.filter { it.startsWith("$scope.") && (it.endsWith(".end") || it.endsWith(".done")) }.forEach { reset.remove(it) }
      reset.remove("$scope.backfill_requested")
      check(reset.commit())
    }
    val key = ActivityWatchKeyStore.get(context)
    val buckets = appJson.decodeFromString<Map<String, AwBucket>>(awGet(local, listOf("buckets", ""), key))
      .filter { (id, b) -> b.type == "currentwindow" || id.startsWith("aw-android-appevents") || id.startsWith("aw-watcher-android") && !id.contains("unlock") }
    if (buckets.isEmpty()) throw AwSyncException("ActivityWatch is reachable but has no app-usage buckets. Open ActivityWatch, grant it Usage Access, and check its app-usage view.", false)
    status = status.copy(available = true, bucketsFound = buckets.size)
    var historyPending = false
    for ((bucketId, bucket) in buckets) {
      guard()
      val device = bucket.hostname.takeIf { it.isNotBlank() && it != "unknown" } ?: throw AwSyncException("ActivityWatch bucket has no device hostname. Set the device hostname in ActivityWatch, then retry.", false)
      val bucketKey = "$scope.${bucketId}.${bucket.created}"
      suspend fun fetchPage(end: String?) = readAwPage(end, { upper, limit ->
        val parameters = mutableMapOf("limit" to limit.toString()); upper?.let { parameters["end"] = it }
        appJson.decodeFromString<List<AwEvent>>(awGet(local, listOf("buckets", bucketId, "events"), key, parameters))
      }, { id -> appJson.decodeFromString<AwEvent>(awGet(local, listOf("buckets", bucketId, "events", id.toString()), key)) })
      suspend fun send(page: AwPage) {
        for (chunk in page.events.chunked(500)) {
          guard()
          val response = pushEventsToAurboda(upload, apiUrl, authToken, chunk.map { e ->
            AurbodaAwEvent(e.data["app"]!!.jsonPrimitive.content, e.duration, e.timestamp,
              e.data["title"]?.jsonPrimitive?.contentOrNull, bucketId, e.id?.toString(), e.data,
              (e.data["category"] as? JsonPrimitive)?.contentOrNull, bucket.created)
          }, device, !bucketId.startsWith("aw-watcher-window"))
          if (!response.success) throw AwSyncException(response.error ?: "Aurboda refused the import.", response.stop == null)
          guard()
          val result = response.result!!
          check(prefs.edit().putString("$scope.coverage.$device", appJson.encodeToString(AurbodaAwSyncResult.serializer(), result)).commit())
          val coverage = prefs.all.filterKeys { it.startsWith("$scope.coverage.") }.values.mapNotNull { value ->
            (value as? String)?.let { appJson.decodeFromString<AurbodaAwSyncResult>(it) }
          }
          status = status.copy(eventsFetched = status.eventsFetched + chunk.size, eventsPushed = coverage.sumOf { it.events_total ?: 0 },
            earliest = coverage.mapNotNull { it.earliest_event }.minByOrNull { Instant.parse(it) },
            latest = coverage.mapNotNull { it.latest_event }.maxByOrNull { Instant.parse(it) })
          save()
        }
      }
      // Recent imports run even when a long historical import is unfinished.
      var recentEnd = prefs.getString("$bucketKey.recent_end", null)
      val recentFloor = prefs.getString("$bucketKey.recent_floor", null)?.let(Instant::parse)
        ?: (prefs.getString("$bucketKey.recent", null)?.let(Instant::parse) ?: Instant.now()).minusSeconds(86400)
      var recentNewest = prefs.getString("$bucketKey.recent_newest", null)
      var recentComplete = false
      repeat(8) {
        if (!recentComplete) {
          val page = fetchPage(recentEnd)
          if (recentNewest == null) recentNewest = page.events.maxOfOrNull { Instant.parse(it.timestamp) }?.toString()
          send(page)
          recentEnd = page.nextEnd
          recentComplete = recentEnd == null || Instant.parse(recentEnd) < recentFloor
          guard()
          val edit = prefs.edit()
          if (recentComplete) {
            edit.putString("$bucketKey.recent", recentNewest).remove("$bucketKey.recent_end").remove("$bucketKey.recent_floor").remove("$bucketKey.recent_newest")
          } else {
            edit.putString("$bucketKey.recent_end", recentEnd).putString("$bucketKey.recent_floor", recentFloor.toString()).putString("$bucketKey.recent_newest", recentNewest)
          }
          check(edit.commit())
        }
      }
      if (!recentComplete) historyPending = true
      if (!prefs.getBoolean("$bucketKey.done", false)) {
        var end = prefs.getString("$bucketKey.end", null)
        var done = false
        repeat(8) {
          if (!done) {
            guard()
            status = status.copy(progress = "Importing history: ${end ?: "newest available events"}"); save()
            val page = fetchPage(end)
            send(page)
            guard()
            end = page.nextEnd
            done = end == null
            check(prefs.edit().putString("$bucketKey.end", end).putBoolean("$bucketKey.done", done).commit())
          }
        }
        historyPending = historyPending || !done
      }
    }
    status = status.copy(running = false, lastSuccess = Instant.now().toString(), progress = if (historyPending) "History import paused; continuing automatically" else "All available history imported", retryable = historyPending)
    save()
    status
  } catch (e: CancellationException) {
    if (stillCurrent()) { status = status.copy(running = false, progress = "Import interrupted; retry resumes from the saved checkpoint"); save() }
    throw e
  }
  catch (e: Exception) {
    status = status.copy(running = false, error = if (e is AwSyncException) e.message else "Cannot read or import ActivityWatch data. Open ActivityWatch, check its API key and network connection, then retry. Your checkpoint is preserved.", retryable = (e as? AwSyncException)?.retryable ?: true)
    save(); status
  } finally { local.close(); upload.close() }
}
