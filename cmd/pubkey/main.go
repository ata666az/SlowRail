package main

import (
	"crypto/ecdh"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
)

func main() {
	value := strings.TrimSpace(os.Getenv("PRIVATE_KEY"))
	value = strings.TrimPrefix(strings.TrimPrefix(value, "0x"), "0X")
	decoded, err := hex.DecodeString(value)
	if err != nil || len(decoded) != 32 {
		fmt.Fprintln(os.Stderr, "PRIVATE_KEY must be exactly 64 hexadecimal characters (32 bytes)")
		os.Exit(2)
	}
	privateKey, err := ecdh.X25519().NewPrivateKey(decoded)
	if err != nil {
		fmt.Fprintln(os.Stderr, "could not parse X25519 private key:", err)
		os.Exit(2)
	}
	fmt.Println(hex.EncodeToString(privateKey.PublicKey().Bytes()))
}
