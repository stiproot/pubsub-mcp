import { Context, Effect, Layer } from "effect"
import { GenerationError } from "../errors.js"
import type { GenerateReadmeInput } from "../schemas.js"

/**
 * README template generator
 */
const generateReadmeTemplate = (input: GenerateReadmeInput): string => {
  const sections: string[] = []

  // Title and Description
  sections.push(`# ${input.name}`)
  sections.push("")
  sections.push(input.description)
  sections.push("")

  // Features
  if (input.features && input.features.length > 0) {
    sections.push("## Features")
    sections.push("")
    input.features.forEach(feature => {
      sections.push(`- ${feature}`)
    })
    sections.push("")
  }

  // Installation
  sections.push("## Installation")
  sections.push("")
  if (input.installation) {
    sections.push(input.installation)
  } else {
    sections.push("```bash")
    sections.push("npm install")
    sections.push("```")
  }
  sections.push("")

  // Usage
  sections.push("## Usage")
  sections.push("")
  if (input.usage) {
    sections.push(input.usage)
  } else {
    sections.push("```bash")
    sections.push("npm start")
    sections.push("```")
  }
  sections.push("")

  // Configuration
  if (input.configuration && Object.keys(input.configuration).length > 0) {
    sections.push("## Configuration")
    sections.push("")
    sections.push("The following environment variables are required:")
    sections.push("")
    sections.push("| Variable | Description | Default |")
    sections.push("|----------|-------------|---------|")
    Object.entries(input.configuration).forEach(([key, value]) => {
      sections.push(`| ${key} | ${value} | - |`)
    })
    sections.push("")
  }

  // Dependencies
  if (input.dependencies && input.dependencies.length > 0) {
    sections.push("## Dependencies")
    sections.push("")
    input.dependencies.forEach(dep => {
      sections.push(`- ${dep}`)
    })
    sections.push("")
  }

  // Contributing
  sections.push("## Contributing")
  sections.push("")
  if (input.contributing) {
    sections.push(input.contributing)
  } else {
    sections.push("Contributions are welcome! Please follow these steps:")
    sections.push("")
    sections.push("1. Fork the repository")
    sections.push("2. Create a feature branch (`git checkout -b feature/amazing-feature`)")
    sections.push("3. Commit your changes (`git commit -m 'Add amazing feature'`)")
    sections.push("4. Push to the branch (`git push origin feature/amazing-feature`)")
    sections.push("5. Open a Pull Request")
  }
  sections.push("")

  // Authors
  if (input.authors && input.authors.length > 0) {
    sections.push("## Authors")
    sections.push("")
    input.authors.forEach(author => {
      sections.push(`- ${author}`)
    })
    sections.push("")
  }

  // License
  sections.push("## License")
  sections.push("")
  if (input.license) {
    sections.push(input.license)
  } else {
    sections.push("This project is licensed under the MIT License.")
  }
  sections.push("")

  return sections.join("\n")
}

/**
 * ReadmeGeneratorService interface
 */
export class ReadmeGeneratorService extends Context.Tag("ReadmeGeneratorService")<
  ReadmeGeneratorService,
  {
    readonly generate: (
      input: GenerateReadmeInput
    ) => Effect.Effect<string, GenerationError>
    readonly generateFromTemplate: (
      templateContent: string,
      variables: Record<string, string>
    ) => Effect.Effect<string, GenerationError>
  }
>() {}

/**
 * Live implementation of ReadmeGeneratorService
 */
export const ReadmeGeneratorServiceLive = Layer.succeed(ReadmeGeneratorService, {
  generate: (input: GenerateReadmeInput) =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Generating README", { name: input.name })

      yield* Effect.try({
        try: () => {
          if (!input.name || input.name.trim().length === 0) {
            throw new Error("Project name is required")
          }
          if (!input.description || input.description.trim().length === 0) {
            throw new Error("Project description is required")
          }
        },
        catch: (error) =>
          new GenerationError({
            message: String(error),
            cause: error
          })
      })

      const readme = generateReadmeTemplate(input)

      yield* Effect.logInfo("README generated successfully", {
        length: readme.length
      })

      return readme
    }),

  generateFromTemplate: (templateContent: string, variables: Record<string, string>) =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Generating README from template", {
        variableCount: Object.keys(variables).length
      })

      let result = templateContent

      // Replace variables in the format {{VARIABLE_NAME}}
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g")
        result = result.replace(regex, value)
      }

      // Check for unreplaced variables
      const unreplaced = result.match(/{{[^}]+}}/g)
      if (unreplaced) {
        yield* Effect.logWarning("Some variables were not replaced", {
          unreplaced
        })
      }

      yield* Effect.logInfo("README generated from template", {
        length: result.length
      })

      return result
    })
})

/**
 * Test implementation of ReadmeGeneratorService
 */
export const ReadmeGeneratorServiceTest = Layer.succeed(ReadmeGeneratorService, {
  generate: (input: GenerateReadmeInput) =>
    Effect.succeed(`# ${input.name}\n\n${input.description}\n`),

  generateFromTemplate: (templateContent: string, variables: Record<string, string>) =>
    Effect.succeed("# Test README\n\nGenerated from template")
})
