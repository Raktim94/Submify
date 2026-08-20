// Package mailer sends submission-notification emails through a
// per-project SMTP relay the operator configures themselves — see
// docs/decisions/0007-email-notifications-smtp-relay.md for why this is a
// bring-your-own-SMTP model rather than a Submify-managed sending service.
package mailer

import (
	"crypto/tls"
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
// not a bulk-mail use case. Only header VALUES are sanitized here — body
// is intentionally left untouched: the submission's field data is meant
// to appear verbatim in the email body (see ADR 0007), and body content
// can't smuggle headers since it's always written after the blank line
// that already terminates the header block.
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
	b.WriteString("\r\n")
	b.WriteString(body)
	return []byte(b.String())
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

// SendAsync delivers a notification email in the background with 3
// retries, fire-and-forget — same pattern as internal/telegram.NotifyAsync
// and internal/zulivio.PushAsync, so an SMTP outage never affects the
// submission response.
func SendAsync(cfg Config, to []string, subject, body string) {
	if cfg.Host == "" || cfg.Username == "" || cfg.Password == "" || cfg.FromEmail == "" || len(to) == 0 {
		return
	}
	go func() {
		for i := 0; i < 3; i++ {
			if err := send(cfg, to, subject, body); err == nil {
				return
			} else {
				log.Printf("email notify failed (attempt=%d): %v", i+1, err)
			}
			time.Sleep(time.Duration(i+1) * 2 * time.Second)
		}
	}()
}
