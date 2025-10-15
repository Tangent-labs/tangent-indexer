import { describe, it, expect } from "vitest"
import { escapeMarkdown } from "../../utils/text.js"

describe("escapeMarkdown", () => {
  describe("null and undefined handling", () => {
    it("should return undefined for null input", () => {
      const result = escapeMarkdown(null as any)
      expect(result).toBeNull()
    })

    it("should return undefined for undefined input", () => {
      const result = escapeMarkdown(undefined)
      expect(result).toBeUndefined()
    })

    it("should return empty string for empty input", () => {
      const result = escapeMarkdown("")
      expect(result).toBe("")
    })
  })

  describe("nominal cases", () => {
    it("should return the same text when no special characters are present", () => {
      const input = "Hello world this is a normal message"
      const result = escapeMarkdown(input)
      expect(result).toBe(input)
    })

    it("should handle text with numbers and letters only", () => {
      const input = "Price is 100 USD for item 123"
      const result = escapeMarkdown(input)
      expect(result).toBe(input)
    })

    it("should handle text with spaces and common punctuation", () => {
      const input = "Hello, world! How are you today?"
      const result = escapeMarkdown(input)
      expect(result).toBe("Hello, world\\! How are you today?")
    })
  })

  describe("special character escaping", () => {
    it("should escape underscore (_)", () => {
      const input = "This is _italic_ text"
      const result = escapeMarkdown(input)
      expect(result).toBe("This is \\_italic\\_ text")
    })

    it("should escape asterisk (*)", () => {
      const input = "This is *bold* text"
      const result = escapeMarkdown(input)
      expect(result).toBe("This is \\*bold\\* text")
    })

    it("should escape square brackets ([ ])", () => {
      const input = "Check [this link] for more info"
      const result = escapeMarkdown(input)
      expect(result).toBe("Check \\[this link\\] for more info")
    })

    it("should escape parentheses ( )", () => {
      const input = "Price dropped (50% off) today"
      const result = escapeMarkdown(input)
      expect(result).toBe("Price dropped \\(50% off\\) today")
    })

    it("should escape tilde (~)", () => {
      const input = "User ~deleted~ updated the message"
      const result = escapeMarkdown(input)
      expect(result).toBe("User \\~deleted\\~ updated the message")
    })

    it("should escape backtick (`)", () => {
      const input = "Use `console.log()` for debugging"
      const result = escapeMarkdown(input)
      expect(result).toBe("Use \\`console\\.log\\(\\)\\` for debugging")
    })

    it("should escape greater than (>)", () => {
      const input = "Error: value > 100 is invalid"
      const result = escapeMarkdown(input)
      expect(result).toBe("Error: value \\> 100 is invalid")
    })

    it("should escape hash (#)", () => {
      const input = "Issue #123 has been resolved"
      const result = escapeMarkdown(input)
      expect(result).toBe("Issue \\#123 has been resolved")
    })

    it("should escape plus (+)", () => {
      const input = "Balance +100 tokens added"
      const result = escapeMarkdown(input)
      expect(result).toBe("Balance \\+100 tokens added")
    })

    it("should escape minus (-)", () => {
      const input = "Price -50% discount applied"
      const result = escapeMarkdown(input)
      expect(result).toBe("Price \\-50% discount applied")
    })

    it("should escape equals (=)", () => {
      const input = "Status = completed successfully"
      const result = escapeMarkdown(input)
      expect(result).toBe("Status \\= completed successfully")
    })

    it("should escape pipe (|)", () => {
      const input = "Options: A | B | C available"
      const result = escapeMarkdown(input)
      expect(result).toBe("Options: A \\| B \\| C available")
    })

    it("should escape curly braces ({ })", () => {
      const input = "Object {key: value} structure"
      const result = escapeMarkdown(input)
      expect(result).toBe("Object \\{key: value\\} structure")
    })

    it("should escape period (.)", () => {
      const input = "Version 1.2.3 released"
      const result = escapeMarkdown(input)
      expect(result).toBe("Version 1\\.2\\.3 released")
    })

    it("should escape exclamation mark (!)", () => {
      const input = "Alert! System is down!"
      const result = escapeMarkdown(input)
      expect(result).toBe("Alert\\! System is down\\!")
    })
  })

  describe("multiple special characters", () => {
    it("should escape all special characters in a complex message", () => {
      const input = "Alert: Price dropped 50%! Check [link](https://example.com) for details. Status: {active: true, count: 100}"
      const result = escapeMarkdown(input)
      expect(result).toBe("Alert: Price dropped 50%\\! Check \\[link\\]\\(https://example\\.com\\) for details\\. Status: \\{active: true, count: 100\\}")
    })

    it("should handle repeated special characters", () => {
      const input = "*** Triple asterisk *** and ___ triple underscore ___"
      const result = escapeMarkdown(input)
      expect(result).toBe("\\*\\*\\* Triple asterisk \\*\\*\\* and \\_\\_\\_ triple underscore \\_\\_\\_")
    })

    it("should handle mixed formatting attempts", () => {
      const input = "*Bold* and _italic_ and `code` text"
      const result = escapeMarkdown(input)
      expect(result).toBe("\\*Bold\\* and \\_italic\\_ and \\`code\\` text")
    })
  })

  describe("edge cases", () => {
    it("should handle only special characters", () => {
      const input = "_*[]()~`>#+-=|{}.!"
      const result = escapeMarkdown(input)
      expect(result).toBe("\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!")
    })

    it("should handle special characters at the beginning and end", () => {
      const input = "*Start* and *End*"
      const result = escapeMarkdown(input)
      expect(result).toBe("\\*Start\\* and \\*End\\*")
    })

    it("should handle consecutive special characters", () => {
      const input = "Math: (a + b) * (c - d) = result"
      const result = escapeMarkdown(input)
      expect(result).toBe("Math: \\(a \\+ b\\) \\* \\(c \\- d\\) \\= result")
    })

    it("should handle URLs with special characters", () => {
      const input = "Visit https://example.com/path?param=value&other=123"
      const result = escapeMarkdown(input)
      expect(result).toBe("Visit https://example\\.com/path?param\\=value&other\\=123")
    })

    it("should handle JSON-like strings", () => {
      const input = '{"status": "success", "count": 42, "active": true}'
      const result = escapeMarkdown(input)
      expect(result).toBe('\\{"status": "success", "count": 42, "active": true\\}')
    })
  })

  describe("real-world scenarios", () => {
    it("should handle error messages", () => {
      const input = "❌ Error: Database connection failed! Retry count: 3/5"
      const result = escapeMarkdown(input)
      expect(result).toBe("❌ Error: Database connection failed\\! Retry count: 3/5")
    })

    it("should handle price alerts", () => {
      const input = "💰 Price Alert: BTC dropped 15%! Current: $45,000 (was $53,000)"
      const result = escapeMarkdown(input)
      expect(result).toBe("💰 Price Alert: BTC dropped 15%\\! Current: $45,000 \\(was $53,000\\)")
    })

    it("should handle system status updates", () => {
      const input = "🟢 System Status: All services operational. Uptime: 99.9% (last 30 days)"
      const result = escapeMarkdown(input)
      expect(result).toBe("🟢 System Status: All services operational\\. Uptime: 99\\.9% \\(last 30 days\\)")
    })

    it("should handle liquidation alerts", () => {
      const input = "⚠️ Liquidation Alert: User 0x123...abc position at 95% collateral ratio!"
      const result = escapeMarkdown(input)
      expect(result).toBe("⚠️ Liquidation Alert: User 0x123\\.\\.\\.abc position at 95% collateral ratio\\!")
    })
  })
})
