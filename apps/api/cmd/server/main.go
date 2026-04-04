package main

import (
	"log"

	"github.com/nodedr/submify/apps/api/internal/app"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
