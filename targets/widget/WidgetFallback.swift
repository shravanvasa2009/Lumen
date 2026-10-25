import SwiftUI

// Drawn before the app first publishes. Copied from the app's i18n files and src/theme/tokens.json; keep
// them in sync.
struct FallbackCopy {
  let description: String
  let emptyTitle: String
  let emptyBody: String
  let checkNow: String
  let fullScan: String
}

private let englishCopy = FallbackCopy(
  description: "Your last check, with Check now and Full Scan",
  emptyTitle: "No checks yet",
  emptyBody: "Takes 90 seconds",
  checkNow: "Check now",
  fullScan: "Full Scan"
)

private let spanishCopy = FallbackCopy(
  description: "Tu última revisión, con Revisar ahora y Escaneo completo",
  emptyTitle: "Sin revisiones aún",
  emptyBody: "Toma 90 segundos",
  checkNow: "Revisar ahora",
  fullScan: "Escaneo completo"
)

// English and Spanish only; any other language reads English.
let fallbackCopy = Locale.current.language.languageCode?.identifier == "es" ? spanishCopy : englishCopy

// buttonFill and its text are the same in light and dark.
let fallbackButtonFill = Color(hex: "#0B7A70")
let fallbackOnButtonFill = Color(hex: "#FFFFFF")
