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

// buildMessage constructs a minimal, valid RFC 5322 message with a plain
// text body. Recipients are joined into a single To header (all visible
// to each other) — appropriate for a small internal notification list,
// not a bulk-mail use case.
func buildMessage(from string, to []string, subject, body string) []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", strings.Join(to, ", "))
	fmt.Fprintf(&b, "Subject: %s\r\n", subject)
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=\"utf-8\"\r\n")
	b.WriteString("\r\n")
	b.WriteString(body)
	return []byte(b.String())
}

// send picks implicit TLS (common on port 465) vs. STARTTLS (587 and most
// others) based on the configured port — the two conventions real-world
// SMTP providers actually use, and guessing wrong is the single most
// common self-hosted SMTP support issue, worth handling correctly rather
// than requiring the operator to pick a "mode" themselves.
func send(cfg Config, to []string, subject, body string) error {
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
