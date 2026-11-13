package net.aurboda

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import net.aurboda.api.models.CreateTaskItemBody
import net.aurboda.api.models.PeopleEventBody
import net.aurboda.api.models.PharmacologyTimelineEntryOneOf3
import net.aurboda.api.models.PlanningSuccessResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Test

class GeneratedModelSerializationTest {
  private val json = Json { encodeDefaults = true }

  @Test
  fun `task priority stays a JSON number and its default selects the zero enum member`() {
    val task = json.decodeFromString(CreateTaskItemBody.serializer(), """{"title":"Review"}""")
    assertEquals(CreateTaskItemBody.Priority._0, task.priority)
    val encoded = json.encodeToJsonElement(CreateTaskItemBody.serializer(), task).jsonObject
    assertEquals(JsonPrimitive(0.0), encoded["priority"])

    val updated = json.decodeFromString(
      CreateTaskItemBody.serializer(),
      """{"title":"Review","priority":2}""",
    )
    assertEquals(CreateTaskItemBody.Priority._2, updated.priority)
    assertEquals(
      updated,
      json.decodeFromString(CreateTaskItemBody.serializer(), json.encodeToString(CreateTaskItemBody.serializer(), updated)),
    )
    assertThrows(SerializationException::class.java) {
      json.decodeFromString(CreateTaskItemBody.serializer(), """{"title":"Review","priority":9}""")
    }
  }

  @Test
  fun `success const stays a JSON boolean and false is rejected`() {
    val success = json.decodeFromString(PlanningSuccessResponse.serializer(), """{"success":true}""")
    assertEquals(PlanningSuccessResponse.Success.`true`, success.success)
    assertEquals("""{"success":true}""", json.encodeToString(PlanningSuccessResponse.serializer(), success))
    assertThrows(SerializationException::class.java) {
      json.decodeFromString(PlanningSuccessResponse.serializer(), """{"success":false}""")
    }
  }

  @Test
  fun `empty People payload defaults to a model and context enum keeps its wire spelling`() {
    val event = json.decodeFromString(
      PeopleEventBody.serializer(),
      """{"type":"observation","timestamp":"2026-11-13T12:00:00Z"}""",
    )
    assertNotNull(event.payload)
    assertEquals(
      "\"context\"",
      json.encodeToString(PharmacologyTimelineEntryOneOf3.Type.serializer(), PharmacologyTimelineEntryOneOf3.Type.`context`),
    )
  }
}
