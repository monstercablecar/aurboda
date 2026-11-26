package net.aurboda

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.*
import io.ktor.http.content.TextContent
import io.ktor.serialization.kotlinx.json.json
import io.mockk.*
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class ActivityWatchImportTest {
  private lateinit var context: Context
  private var account = CredentialsManager.Credentials("https://example.test", "alice", "remote-token")
  @Before fun setup() {
    context = ApplicationProvider.getApplicationContext()
    context.getSharedPreferences("ActivityWatchSyncV2", Context.MODE_PRIVATE).edit().clear().commit()
    mockkObject(CredentialsManager, ActivityWatchKeyStore)
    every { CredentialsManager.getCredentials(any()) } answers { account }
    every { ActivityWatchKeyStore.get(any()) } returns "local-key"
    context.getSharedPreferences("ActivityWatchSyncV2", Context.MODE_PRIVATE).edit().putBoolean("${activityWatchScope(context)}.enabled", true).commit()
  }
  @After fun cleanup() { unmockkAll() }

  @Test fun `interrupted history resumes and repeated import preserves unique server counts`() = runTest {
    val source = (0..1200).map { i -> AwEvent(Instant.parse("2025-01-01T00:00:00Z").plusSeconds(i.toLong() * 120).toString(), 1.25, buildJsonObject { put("app", "Synthetic") }, i.toLong()) }.toMutableList()
    fun local() = HttpClient(MockEngine { request ->
      assertEquals("Bearer local-key", request.headers[HttpHeaders.Authorization])
      val path = request.url.encodedPath
      val body = when {
        path.endsWith("/buckets/") -> """{"aw-watcher-android":{"type":"currentwindow","hostname":"pixel_9_pro","created":"2025-01-01T00:00:00Z"}}"""
        path.substringAfterLast('/').toLongOrNull() != null -> appJson.encodeToString(AwEvent.serializer(), source[path.substringAfterLast('/').toInt()])
        else -> {
          val end = request.url.parameters["end"]?.let(Instant::parse)
          val events = source.filter { end == null || Instant.parse(it.timestamp) <= end }.sortedByDescending { it.timestamp }
            .take(request.url.parameters["limit"]!!.toInt()).map { e -> if (end == null) e else e.copy(duration = minOf(e.duration, (end.toEpochMilli()-Instant.parse(e.timestamp).toEpochMilli())/1000.0)) }
          appJson.encodeToString(kotlinx.serialization.builtins.ListSerializer(AwEvent.serializer()), events)
        }
      }
      respond(body, headers = headersOf(HttpHeaders.ContentType, "application/json"))
    })
    val stored = mutableMapOf<String, AurbodaAwEvent>()
    var calls = 0
    var fail = true
    val remote = HttpClient(MockEngine { request ->
      assertEquals("Bearer remote-token", request.headers[HttpHeaders.Authorization])
      val body = appJson.decodeFromString<AurbodaAwSyncBody>((request.body as TextContent).text)
      calls++
      if (fail && calls == 2) respond("{}", HttpStatusCode.ServiceUnavailable)
      else {
        body.events.forEach { stored[it.source_event_id!!] = it }
        respond("""{"success":true,"result":{"status":"success","records_stored":${body.events.size},"device_name":"pixel_9_pro","events_total":${stored.size},"earliest_event":"2025-01-01T00:00:00Z","latest_event":"2025-01-01T00:20:00Z"}}""", headers = headersOf(HttpHeaders.ContentType, "application/json"))
      }
    }) { install(ContentNegotiation) { json(appJson) } }
    val first = processActivityWatchSync(account.apiUrl, account.authToken, remote, context, localClient = local())
    assertNotNull(first.error)
    assertNull(first.lastSuccess)
    fail = false
    val resumed = processActivityWatchSync(account.apiUrl, account.authToken, remote, context, localClient = local())
    assertNull(resumed.error)
    assertEquals(1201, resumed.eventsPushed)
    assertEquals(1201, stored.size)
    assertTrue(stored.values.all { it.duration == 1.25 })
    val replay = processActivityWatchSync(account.apiUrl, account.authToken, remote, context, backfill = true, localClient = local())
    assertEquals(1201, replay.eventsPushed)
    assertEquals(1201, stored.size)
    source[0] = source[0].copy(data = buildJsonObject { put("app", "Historical correction") })
    val scope = activityWatchScope(context)!!
    context.getSharedPreferences("ActivityWatchSyncV2", Context.MODE_PRIVATE).edit().putString("$scope.backfill_requested", "request-1").commit()
    every { ActivityWatchKeyStore.get(any()) } throws IllegalStateException("temporarily locked")
    val unavailable = processActivityWatchSync(account.apiUrl, account.authToken, remote, context, localClient = local())
    assertNotNull(unavailable.error)
    every { ActivityWatchKeyStore.get(any()) } returns "local-key"
    val backfillRetry = processActivityWatchSync(account.apiUrl, account.authToken, remote, context, localClient = local())
    assertNull(backfillRetry.error)
    assertEquals("Historical correction", stored["0"]?.app)
    assertEquals(1201, stored.size)
    account = account.copy(username = "bob", authToken = "different-token")
    assertFalse(isActivityWatchSyncEnabled(context))
    assertEquals(0, loadActivityWatchStatus(context).eventsPushed)
    remote.close()
  }
}
