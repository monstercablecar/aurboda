import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fixKotlinModel } from './fix-kotlin-models.mjs'

const numericModel = `package net.aurboda.api.models
data class CreateTaskItemBody (
    val priority: CreateTaskItemBody.Priority? = kotlin.Double("0"),
    val position: kotlin.Double? = kotlin.Double("15")
) {
    @Serializable
    enum class Priority(val value: kotlin.Double) {
        @SerialName(value = "0.0") _0(0.0),
        @SerialName(value = "1.0") _1(1.0);
    }
}`

test('numeric enum defaults select a member and serializer preserves numeric wire values', () => {
  const fixed = fixKotlinModel(numericModel)
  assert.match(fixed, /val priority: CreateTaskItemBody.Priority\? = Priority\._0/)
  assert.match(fixed, /val position: kotlin.Double\? = 15\.0/)
  assert.match(fixed, /@Serializable\(with = Priority.Serializer::class\)/)
  assert.match(fixed, /encoder.encodeDouble\(value.value\)/)
  assert.match(fixed, /decoder.decodeDouble\(\)/)
  assert.match(fixed, /entries.firstOrNull \{ it.value == value \}/)
  assert.match(fixed, /throw kotlinx.serialization.SerializationException/)
  assert.match(fixed, /@SerialName\(value = "0.0"\) _0\(0.0\)/)
  assert.equal(fixKotlinModel(fixed), fixed)
})

test('boolean const enums use Boolean constructor values and reject unsupported values on decode', () => {
  const input = `package net.aurboda.api.models
data class PlanningSuccessResponse(val success: PlanningSuccessResponse.Success) {
    @Serializable
    enum class Success(val value: kotlin.Boolean) {
        @SerialName(value = "true") \`true\`("true");
    }
}`
  const fixed = fixKotlinModel(input)
  assert.match(fixed, /`true`\(true\)/)
  assert.match(fixed, /encoder.encodeBoolean\(value.value\)/)
  assert.match(fixed, /decoder.decodeBoolean\(\)/)
  assert.match(fixed, /entries.firstOrNull \{ it.value == value \}/)
  assert.match(fixed, /throw kotlinx.serialization.SerializationException/)
  assert.doesNotMatch(fixed, /`false`\(/)
  assert.equal(fixKotlinModel(fixed), fixed)
})

test('object defaults construct the payload and contextual keyword keeps its wire name', () => {
  const fixed = fixKotlinModel(`val payload: PeopleEventBodyPayload? = {},
@SerialName(value = "context") context("context");
val type: Type = Type.context`)
  assert.equal(
    fixed,
    `val payload: PeopleEventBodyPayload? = PeopleEventBodyPayload(),
@SerialName(value = "context") \`context\`("context");
val type: Type = Type.\`context\``,
  )
})

test('existing contextual, URI, map inheritance and primitive fixes remain', () => {
  const fixed = fixKotlinModel(`import kotlinx.serialization.Contextual
import java.net.URI
@Contextual val value: kotlin.Double = kotlin.Double("1.25")
val count: kotlin.Int = kotlin.Int("5")
) : kotlin.collections.HashMap<String, kotlin.String>()() {`)
  assert.equal(
    fixed,
    `val value: kotlin.Double = 1.25
val count: kotlin.Int = 5
) {`,
  )
})

test('valid string enums, strings, object expressions and defaults are untouched', () => {
  const valid = `@Serializable
enum class Kind(val value: kotlin.String) {
    @SerialName(value = "true") truth("true");
}
val payload: OtherPayload? = null
val callback = {}
val kind: Kind = Kind.truth
val number: kotlin.Double = 0.0`
  assert.equal(fixKotlinModel(valid), valid)
})

test('an unknown enum default fails generation instead of weakening the enum', () => {
  assert.throws(
    () => fixKotlinModel(numericModel.replace('kotlin.Double("0")', 'kotlin.Double("9")')),
    /No CreateTaskItemBody.Priority entry/,
  )
})
