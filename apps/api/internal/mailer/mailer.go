// Package mailer sends submission-notification emails through a
// per-project SMTP relay the operator configures themselves — see
// docs/decisions/0007-email-notifications-smtp-relay.md for why this is a
// bring-your-own-SMTP model rather than a Submify-managed sending service.
package mailer

import (
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"
	"time"
)

type Config struct {
	Host      string
	Port      int
	Username  string
	Password  string
	FromEmail string
}

func (c Config) addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// sanitizeHeaderValue strips CR/LF from a value before it's interpolated
// into a raw RFC 5322 header line. from/to/subject here ultimately trace
// back to user-supplied fields (project.Name, project.NotificationRecipients)
// — buildMessage writes headers via direct string formatting, so an
// unsanitized "\r\n" would let an attacker who controls one of those
// fields terminate its header early and smuggle arbitrary extra header
// lines (a hidden Bcc, a spoofed Reply-To) into every notification email
// that project sends (CWE-93 email header injection). Safe to just drop
// stray control characters here — they carry no meaning in a header value
// and stripping them can't misdirect the message the way silently
// mutating an address could (see validateAddresses below for why
// addresses are rejected instead of sanitized).
func sanitizeHeaderValue(s string) string {
	return strings.NewReplacer("\r", "", "\n", "").Replace(s)
}

// buildMessage constructs a minimal, valid RFC 5322 message with a plain
// text body. Recipients are joined into a single To header (all visible
// to each other) — appropriate for a small internal notification list,
// not a bulk-mail use case. Header VALUES are sanitized (see
// sanitizeHeaderValue). The body is base64-encoded (Content-Transfer-
// Encoding: base64, RFC 2045) rather than written raw: the submission's
// field data must appear verbatim once decoded by the mail client (see
// ADR 0007), but it is fully attacker-controlled and arbitrary-length, so
// writing it unencoded would let it carry any byte sequence — including
// CRLF pairs and lines that resemble headers — straight into the raw
// bytes handed to the SMTP connection (CWE-93 email content injection,
// flagged by CodeQL at the SendMail/w.Write call sites below). Base64
// restricts the body's on-wire representation to [A-Za-z0-9+/=\r\n],
// which closes that off structurally rather than relying on a blocklist
// of "dangerous" substrings.
func buildMessage(from string, to []string, subject, body string) []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", sanitizeHeaderValue(from))
	safeTo := make([]string, len(to))
	for i, addr := range to {
		safeTo[i] = sanitizeHeaderValue(addr)
	}
	fmt.Fprintf(&b, "To: %s\r\n", strings.Join(safeTo, ", "))
	fmt.Fprintf(&b, "Subject: %s\r\n", sanitizeHeaderValue(subject))
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=\"utf-8\"\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n")
	b.WriteString("\r\n")
	b.WriteString(encodeBase64Body(body))
	return []byte(b.String())
}

// encodeBase64Body base64-encodes body and wraps it at 76 characters per
// line (RFC 2045 §6.8's line-length limit for the base64 transfer
// encoding), so mail clients that enforce that limit decode it correctly.
func encodeBase64Body(body string) string {
	encoded := base64.StdEncoding.EncodeToString([]byte(body))
	var b strings.Builder
	const lineLen = 76
	for i := 0; i < len(encoded); i += lineLen {
		end := i + lineLen
		if end > len(encoded) {
			end = len(encoded)
		}
		b.WriteString(encoded[i:end])
		b.WriteString("\r\n")
	}
	return b.String()
}

// validateAddresses rejects (rather than silently mutates) any from/to
// address containing CR or LF. Go's stdlib smtp.SendMail already does
// this internally for its own from/to arguments — but sendImplicitTLS
// below talks to smtp.Client's Mail()/Rcpt() directly, which has no such
// built-in check, so a CRLF in an address there could inject raw SMTP
// protocol commands into the session (a more severe class than header
// injection). Called once in send() so both paths get the same
// protection uniformly, rather than relying on the STARTTLS path's
// built-in check and leaving the implicit-TLS path uncovered.
func validateAddresses(from string, to []string) error {
	if strings.ContainsAny(from, "\r\n") {
		return fmt.Errorf("invalid from address")
	}
	for _, addr := range to {
		if strings.ContainsAny(addr, "\r\n") {
			return fmt.Errorf("invalid recipient address")
		}
	}
	return nil
}

// send picks implicit TLS (common on port 465) vs. STARTTLS (587 and most
// others) based on the configured port — the two conventions real-world
// SMTP providers actually use, and guessing wrong is the single most
// common self-hosted SMTP support issue, worth handling correctly rather
// than requiring the operator to pick a "mode" themselves.
func send(cfg Config, to []string, subject, body string) error {
	if err := validateAddresses(cfg.FromEmail, to); err != nil {
		return err
	}
	msg := buildMessage(cfg.FromEmail, to, subject, body)
	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)

	if cfg.Port == 465 {
		return sendImplicitTLS(cfg, auth, to, msg)
	}
	return smtp.SendMail(cfg.addr(), auth, cfg.FromEmail, to, msg)
}

func sendImplicitTLS(cfg Config, auth smtp.Auth, to []string, msg []byte) error {
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 10 * time.Second}, "tcp", cfg.addr(), &tls.Config{ServerName: cfg.Host})
	if err != nil {
		return fmt.Errorf("tls dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}
	if err := client.Mail(cfg.FromEmail); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	for _, addr := range to {
		if err := client.Rcpt(addr); err != nil {
			return fmt.Errorf("rcpt to %s: %w", addr, err)
		}
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return client.Quit()
}

// Status is the outcome of the most recent notification attempt for a
// project. "Accepted" means the configured SMTP relay returned a success
// reply to the end of the DATA command — it does NOT mean the message
// reached an inbox (see ADR 0007).
type Status string

const (
	StatusPending  Status = "pending"
	StatusAccepted Status = "accepted"
	StatusFailed   Status = "failed"
)

// Reporter receives status transitions for one notification. reason is
// non-empty only for StatusFailed.
type Reporter func(status Status, reason string)

const maxReasonLen = 200

// retryDelay is the pause after failed attempt i (0-based); a var so tests
// can shorten it.
var retryDelay = func(i int) time.Duration { return time.Duration(i+1) * 2 * time.Second }

// failureReason turns an SMTP error into a short, single-line string safe
// to persist: control characters are dropped, the SMTP password is
// redacted if a server echoed it, and the length is capped. It never
// includes the message body or session transcript.
func failureReason(err error, cfg Config) string {
	msg := err.Error()
	if cfg.Password != "" {
		msg = strings.ReplaceAll(msg, cfg.Password, "[redacted]")
	}
	msg = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return ' '
		}
		return r
	}, msg)
	msg = strings.Join(strings.Fields(msg), " ")
	if r := []rune(msg); len(r) > maxReasonLen {
		msg = string(r[:maxReasonLen]) + "…"
	}
	return msg
}

// SendAsync delivers a notification email in the background with 3
// retries, fire-and-forget — same pattern as internal/telegram.NotifyAsync
// and internal/zulivio.PushAsync, so an SMTP outage never affects the
// submission response. report (optional) is told pending → accepted, or
// pending → failed after the final retry.
func SendAsync(cfg Config, to []string, subject, body string, report Reporter) {
	if cfg.Host == "" || cfg.Username == "" || cfg.Password == "" || cfg.FromEmail == "" || len(to) == 0 {
		return
	}
	if report == nil {
		report = func(Status, string) {}
	}
	go func() {
		report(StatusPending, "")
		var lastErr error
		for i := 0; i < 3; i++ {
			if lastErr = send(cfg, to, subject, body); lastErr == nil {
				report(StatusAccepted, "")
				return
			}
			log.Printf("email notify failed (attempt=%d): %v", i+1, lastErr)
			if i < 2 {
				time.Sleep(retryDelay(i))
			}
		}
		report(StatusFailed, failureReason(lastErr, cfg))
	}()
}
