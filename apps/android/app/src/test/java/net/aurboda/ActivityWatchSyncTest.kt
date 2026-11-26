package net.aurboda

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class ActivityWatchSyncTest {
  private fun event(id: Int, timestamp: String = Instant.EPOCH.plusSeconds(id.toLong()).toString(), duration: Double = 1.25) =
    AwEvent(timestamp, duration, buildJsonObject { put("app", "Synthetic app") }, id.toLong())

  @Test fun `protected buckets report key requirement even when info is public`() = runTest {
    val client = HttpClient(MockEngine { request ->
      if (request.url.encodedPath.endsWith("info")) respond("{}") else respond("{}", HttpStatusCode.Unauthorized)
    })
    assertEquals("{}", awGet(client, listOf("info"), ""))
    try { awGet(client, listOf("buckets", ""), ""); fail("401 must not become an empty bucket list") }
    catch (e: AwSyncException) { assertTrue(e.message!!.contains("HTTP 401")); assertFalse(e.retryable) }
    client.close()
  }

  @Test fun `unprotected ActivityWatch works without a key`() = runTest {
    val client = HttpClient(MockEngine { request ->
      assertNull(request.headers[HttpHeaders.Authorization])
      respond("{}", headers = headersOf(HttpHeaders.ContentType, "application/json"))
    })
    assertEquals("{}", awGet(client, listOf("buckets", ""), ""))
    client.close()
  }

  @Test fun `local key uses header and bucket path is encoded`() = runTest {
    val client = HttpClient(MockEngine { request ->
      assertEquals("127.0.0.1", request.url.host)
      assertEquals("Bearer local-test-key", request.headers[HttpHeaders.Authorization])
      assertFalse(request.url.toString().contains("local-test-key"))
      assertTrue(request.url.encodedPath.contains("%2F"))
      respond("[]")
    })
    awGet(client, listOf("buckets", "a/b ?", "events"), "local-test-key")
    client.close()
  }

  @Test fun `history pagination preserves ties original durations and offsets`() = runTest {
    val source = (0..1600).map { event(it) } + (2000..2600).map { event(it, "1970-01-01T00:08:20+00:00", 10000.125) }
    val seen = mutableMapOf<Long, AwEvent>()
    var cursor: String? = null
    var pages = 0
    do {
      val page = readAwPage(cursor, { end, limit ->
        source.filter { end == null || Instant.parse(it.timestamp) <= Instant.parse(end) }
          .sortedByDescending { Instant.parse(it.timestamp) }.take(limit).map { e ->
            if (end == null) e else e.copy(duration = minOf(e.duration, (Instant.parse(end).toEpochMilli()-Instant.parse(e.timestamp).toEpochMilli())/1000.0))
          }
      }, { id -> source.first { it.id == id } })
      page.events.forEach { seen[it.id!!] = it }
      cursor = page.nextEnd
      pages++
      assertTrue("pagination must make progress", pages < 20)
    } while (cursor != null)
    assertEquals(source.size, seen.size)
    source.forEach { assertEquals(it, seen[it.id]) }
  }

  @Test fun `failed page hydration cannot advance a checkpoint`() = runTest {
    try { readAwPage("1970-01-01T00:00:02Z", { _, _ -> listOf(event(1, duration = 1.0)) }, { throw AwSyncException("offline") }); fail() }
    catch (e: AwSyncException) { assertEquals("offline", e.message) }
  }

  @Test fun `server logical errors and partial acknowledgments are rejected`() = runTest {
    for (body in listOf("""{"success":true,"result":{"status":"error","records_stored":0,"device_name":"test"}}""",
      """{"success":true,"result":{"status":"success","records_stored":0,"events_total":0,"device_name":"test"}}""")) {
      val client = HttpClient(MockEngine { respond(body, headers = headersOf(HttpHeaders.ContentType, "application/json")) }) {
        install(ContentNegotiation) { json(appJson) }
      }
      try { pushEventsToAurboda(client, "https://example.test/api", "remote-test-key", listOf(AurbodaAwEvent("test", 1.0, "2026-01-01T00:00:00Z")), "test"); fail() }
      catch (e: AwSyncException) { assertTrue(e.message!!.contains("complete batch")) }
      client.close()
    }
  }
}
