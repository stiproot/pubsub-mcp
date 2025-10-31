import { Context, Effect, Layer } from "effect"
import { ValidationError } from "../errors.js"
import type { ValidationResult } from "../schemas.js"

/**
 * Standard README sections to validate
 */
const REQUIRED_SECTIONS = [
  "# ", // Title (H1)
  "## Description",
  "## Installation",
  "## Usage"
]

const RECOMMENDED_SECTIONS = [
  "## Features",
  "## Configuration",
  "## Contributing",
  "## License",
  "## Testing",
  "## Documentation"
]

/**
 * ReadmeValidatorService interface
 */
export class ReadmeValidatorService extends Context.Tag("ReadmeValidatorService")<
  ReadmeValidatorService,
  {
    readonly validate: (
      content: string,
      strictMode?: boolean
    ) => Effect.Effect<ValidationResult, ValidationError>
    readonly checkCompleteness: (
      content: string
    ) => Effect.Effect<
      {
        overallScore: number
        requiredSections: { present: string[]; missing: string[] }
        optionalSections: { present: string[]; missing: string[] }
        recommendations: string[]
      },
      ValidationError
    >
  }
>() {}

/**
 * Live implementation of ReadmeValidatorService
 */
export const ReadmeValidatorServiceLive = Layer.succeed(ReadmeValidatorService, {
  validate: (content: string, strictMode = false) =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Validating README content", {
        length: content.length,
        strictMode
      })

      const errors: Array<{ section: string; message: string; severity: "error" | "warning" | "info" }> = []
      const warnings: Array<{ section: string; message: string }> = []
      const missingSections: string[] = []
      const presentSections: string[] = []

      // Check for empty content
      if (!content || content.trim().length === 0) {
        errors.push({
          section: "General",
          message: "README content is empty",
          severity: "error"
        })
        return {
          valid: false,
          score: 0,
          errors,
          warnings,
          missingSections: [...REQUIRED_SECTIONS, ...RECOMMENDED_SECTIONS],
          presentSections: []
        }
      }

      // Check required sections
      for (const section of REQUIRED_SECTIONS) {
        const sectionRegex = new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        if (sectionRegex.test(content)) {
          presentSections.push(section)
        } else {
          missingSections.push(section)
          errors.push({
            section,
            message: `Required section "${section}" is missing`,
            severity: strictMode ? "error" : "warning"
          })
        }
      }

      // Check recommended sections
      for (const section of RECOMMENDED_SECTIONS) {
        const sectionRegex = new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        if (sectionRegex.test(content)) {
          presentSections.push(section)
        } else {
          missingSections.push(section)
          warnings.push({
            section,
            message: `Recommended section "${section}" is missing`
          })
        }
      }

      // Check for title (H1)
      const hasTitle = /^#\s+.+/m.test(content)
      if (!hasTitle) {
        errors.push({
          section: "Title",
          message: "README should start with a title (# Title)",
          severity: "error"
        })
      }

      // Check for description
      const lines = content.split("\n").filter(line => line.trim().length > 0)
      if (lines.length < 3) {
        warnings.push({
          section: "Content",
          message: "README appears to be too short or lacks sufficient content"
        })
      }

      // Check for code blocks (indicates examples)
      const hasCodeBlocks = /```[\s\S]*?```/.test(content)
      if (!hasCodeBlocks) {
        warnings.push({
          section: "Examples",
          message: "Consider adding code examples using code blocks (```)"
        })
      }

      // Check for links
      const hasLinks = /\[.+\]\(.+\)/.test(content)
      if (!hasLinks) {
        warnings.push({
          section: "Links",
          message: "Consider adding relevant links to documentation or resources"
        })
      }

      // Calculate score
      const requiredPresent = presentSections.filter(s =>
        REQUIRED_SECTIONS.some(req => s.includes(req))
      ).length
      const recommendedPresent = presentSections.filter(s =>
        RECOMMENDED_SECTIONS.some(rec => s.includes(rec))
      ).length

      const requiredScore = (requiredPresent / REQUIRED_SECTIONS.length) * 70
      const recommendedScore = (recommendedPresent / RECOMMENDED_SECTIONS.length) * 30
      const score = Math.round(requiredScore + recommendedScore)

      const valid = strictMode
        ? errors.filter(e => e.severity === "error").length === 0
        : errors.length === 0

      yield* Effect.logInfo("README validation complete", {
        valid,
        score,
        errorsCount: errors.length,
        warningsCount: warnings.length
      })

      return {
        valid,
        score,
        errors,
        warnings,
        missingSections,
        presentSections
      }
    }),

  checkCompleteness: (content: string) =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Checking README completeness")

      const requiredPresent: string[] = []
      const requiredMissing: string[] = []
      const optionalPresent: string[] = []
      const optionalMissing: string[] = []

      // Check required sections
      for (const section of REQUIRED_SECTIONS) {
        const sectionRegex = new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        if (sectionRegex.test(content)) {
          requiredPresent.push(section)
        } else {
          requiredMissing.push(section)
        }
      }

      // Check recommended sections
      for (const section of RECOMMENDED_SECTIONS) {
        const sectionRegex = new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        if (sectionRegex.test(content)) {
          optionalPresent.push(section)
        } else {
          optionalMissing.push(section)
        }
      }

      // Calculate overall score
      const requiredScore = (requiredPresent.length / REQUIRED_SECTIONS.length) * 70
      const optionalScore = (optionalPresent.length / RECOMMENDED_SECTIONS.length) * 30
      const overallScore = Math.round(requiredScore + optionalScore)

      // Generate recommendations
      const recommendations: string[] = []
      if (requiredMissing.length > 0) {
        recommendations.push(`Add missing required sections: ${requiredMissing.join(", ")}`)
      }
      if (optionalMissing.length > 0) {
        recommendations.push(`Consider adding recommended sections: ${optionalMissing.slice(0, 3).join(", ")}`)
      }
      if (!/```[\s\S]*?```/.test(content)) {
        recommendations.push("Add code examples using markdown code blocks")
      }
      if (!/\[.+\]\(.+\)/.test(content)) {
        recommendations.push("Include relevant links to documentation or resources")
      }
      if (overallScore === 100) {
        recommendations.push("README meets all standards!")
      }

      yield* Effect.logInfo("Completeness check complete", { overallScore })

      return {
        overallScore,
        requiredSections: {
          present: requiredPresent,
          missing: requiredMissing
        },
        optionalSections: {
          present: optionalPresent,
          missing: optionalMissing
        },
        recommendations
      }
    })
})

/**
 * Test implementation of ReadmeValidatorService
 */
export const ReadmeValidatorServiceTest = Layer.succeed(ReadmeValidatorService, {
  validate: (content: string, strictMode = false) =>
    Effect.succeed({
      valid: true,
      score: 100,
      errors: [],
      warnings: [],
      missingSections: [],
      presentSections: ["# Test", "## Description", "## Installation", "## Usage"]
    }),

  checkCompleteness: (content: string) =>
    Effect.succeed({
      overallScore: 100,
      requiredSections: {
        present: ["# Test", "## Description", "## Installation", "## Usage"],
        missing: []
      },
      optionalSections: {
        present: [],
        missing: RECOMMENDED_SECTIONS
      },
      recommendations: ["README meets all standards!"]
    })
})
