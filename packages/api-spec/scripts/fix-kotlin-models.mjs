import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const primitiveEnums =
  /^([ \t]*)@Serializable\r?\n\1enum class (\w+)\(val value: kotlin\.(Boolean|Double|Int)\) \{\r?\n([\s\S]*?)^\1\}/gm
const enumEntries = /@SerialName\(value = "([^"]+)"\)\s+(`[^`]+`|\w+)\(([^\n]*)\)[,;]/g

const primitiveValue = (wire, kind) => {
  if (kind === 'Boolean') {
    if (wire !== 'true' && wire !== 'false') throw new Error(`Invalid boolean enum value: ${wire}`)
    return wire
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(wire)) throw new Error(`Invalid numeric enum value: ${wire}`)
  if (kind === 'Int' && !Number.isInteger(Number(wire))) {
    throw new Error(`Invalid integer enum value: ${wire}`)
  }
  return kind === 'Double' && !wire.includes('.') ? `${wire}.0` : wire
}

/** Repair generator 7.19's Kotlin output without changing the OpenAPI contracts. */
export const fixKotlinModel = (source) => {
  const packageName = source.match(/^package ([\w.]+)$/m)?.[1] ?? 'generated'
  const modelName = source.match(/^data class (\w+)/m)?.[1]
  const enums = new Map()
  let fixed = source.replace(primitiveEnums, (_match, indent, name, kind, body) => {
    const entries = [...body.matchAll(enumEntries)].map((entry) => ({
      name: entry[2],
      wire: primitiveValue(entry[1], kind),
    }))
    if (entries.length === 0 || !modelName) throw new Error(`Unrecognized primitive enum: ${name}`)
    enums.set(`${modelName}.${name}`, { entries, kind, name })
    const correctedBody = body.replace(enumEntries, (entry, wire, entryName, value) =>
      entry.replace(`${entryName}(${value})`, `${entryName}(${primitiveValue(wire, kind)})`),
    )
    const inner = `${indent}    `
    return `${indent}@Serializable(with = ${name}.Serializer::class)
${indent}enum class ${name}(val value: kotlin.${kind}) {
${correctedBody}
${inner}object Serializer : kotlinx.serialization.KSerializer<${name}> {
${inner}    override val descriptor = kotlinx.serialization.descriptors.PrimitiveSerialDescriptor(
${inner}        "${packageName}.${modelName}.${name}", kotlinx.serialization.descriptors.PrimitiveKind.${kind.toUpperCase()}
${inner}    )
${inner}    override fun serialize(encoder: kotlinx.serialization.encoding.Encoder, value: ${name}) {
${inner}        encoder.encode${kind}(value.value)
${inner}    }
${inner}    override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): ${name} {
${inner}        val value = decoder.decode${kind}()
${inner}        return entries.firstOrNull { it.value == value }
${inner}            ?: throw kotlinx.serialization.SerializationException("Unknown ${modelName}.${name}: $value")
${inner}    }
${inner}}
${indent}}`
  })

  fixed = fixed.replaceAll(
    /(val \w+: )([\w.]+)(\?? = )kotlin\.(?:Double|Int|Boolean)\("([^"]+)"\)/g,
    (match, prefix, type, suffix, wire) => {
      const enumeration = enums.get(type)
      if (!enumeration) return match
      const entry = enumeration.entries.find((value) =>
        enumeration.kind === 'Boolean' ? value.wire === wire : Number(value.wire) === Number(wire),
      )
      if (!entry) throw new Error(`No ${type} entry for default ${wire}`)
      return `${prefix}${type}${suffix}${enumeration.name}.${entry.name}`
    },
  )

  return fixed
    .replaceAll('@Contextual ', '')
    .replaceAll(/^import kotlinx\.serialization\.Contextual\r?\n/gm, '')
    .replaceAll(/^import java\.net\.URI\r?\n/gm, '')
    .replaceAll(') : kotlin.collections.HashMap<String, kotlin.String>()() {', ') {')
    .replaceAll(/kotlin\.Double\("(-?\d+(?:\.\d+)?)"\)/g, (_match, value) =>
      value.includes('.') ? value : `${value}.0`,
    )
    .replaceAll(/kotlin\.Int\("(-?\d+)"\)/g, '$1')
    .replaceAll(/(val payload: PeopleEventBodyPayload\? = )\{\}/g, '$1PeopleEventBodyPayload()')
    .replaceAll(/(@SerialName\(value = "context"\)\s+)context\(/g, '$1`context`(')
    .replaceAll(/\bType\.context\b/g, 'Type.`context`')
}

const fixDirectory = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await fixDirectory(path)
    else if (entry.isFile() && entry.name.endsWith('.kt')) {
      const source = await readFile(path, 'utf8')
      const fixed = fixKotlinModel(source)
      if (fixed !== source) await writeFile(path, fixed)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await fixDirectory(resolve(process.argv[2] ?? 'generated/kotlin'))
}
