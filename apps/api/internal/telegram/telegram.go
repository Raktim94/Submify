package telegram

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"
)

func NotifyAsync(token, chatID, message string) {
	if token == "" || chatID == "" {
		return
	}
	go func() {
		for i := 0; i < 3; i++ {
			if err := send(token, chatID, message); err == nil {
				return
			}
			log.Printf("telegram notify failed (attempt=%d): %v", i+1, err)
			time.Sleep(time.Duration(i+1) * 2 * time.Second)
		}
	}()
}

func send(token, chatID, message string) error {
	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	values := url.Values{}
	values.Set("chat_id", chatID)
	values.Set("text", message)

	resp, err := http.PostForm(endpoint, values)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("telegram status=%d body=%s", resp.StatusCode, string(body))
	}
	return nil
}
