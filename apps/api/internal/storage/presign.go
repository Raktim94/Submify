package storage

import (
	"context"
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	awscreds "github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

type PresignInput struct {
	Endpoint      string
	AccessKey     string
	SecretKey     string
	Bucket        string
	ProjectID     string
	Filename      string
	ExpiryMinutes int
}

type PresignResult struct {
	UploadURL string    `json:"upload_url"`
	ObjectKey string    `json:"object_key"`
	ExpiresAt time.Time `json:"expires_at"`
}

func normalizedEndpoint(endpoint string) (string, error) {
	raw := strings.TrimSpace(endpoint)
	if raw == "" {
		return "", fmt.Errorf("empty endpoint")
	}
	if !strings.Contains(raw, "://") {
		raw = "http://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Host == "" {
		return "", fmt.Errorf("invalid endpoint: missing host")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("unsupported endpoint scheme: %s", u.Scheme)
	}
	return strings.TrimRight(u.String(), "/"), nil
}

func client(ctx context.Context, endpoint, accessKey, secretKey string) (*s3.Client, error) {
	endpointURL, err := normalizedEndpoint(endpoint)
	if err != nil {
		return nil, err
	}
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion("us-east-1"),
		config.WithCredentialsProvider(awscreds.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		config.WithEndpointResolverWithOptions(aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			if service == s3.ServiceID {
				return aws.Endpoint{
					URL:               endpointURL,
					HostnameImmutable: true,
				}, nil
			}
			return aws.Endpoint{}, &aws.EndpointNotFoundError{}
		})),
	)
	if err != nil {
		return nil, err
	}
	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		// RustFS (like many S3-compatible services) works reliably with path-style addressing.
		o.UsePathStyle = true
	})
}

func PresignUpload(ctx context.Context, in PresignInput) (PresignResult, error) {
	c, err := client(ctx, in.Endpoint, in.AccessKey, in.SecretKey)
	if err != nil {
		return PresignResult{}, err
	}

	ext := filepath.Ext(in.Filename)
	key := strings.Join([]string{
		in.ProjectID,
		time.Now().UTC().Format("2006-01-02"),
		uuid.NewString() + ext,
	}, "/")

	expires := time.Duration(in.ExpiryMinutes) * time.Minute
	presigner := s3.NewPresignClient(c)
	uploadReq, err := presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(in.Bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) { opts.Expires = expires })
	if err != nil {
		return PresignResult{}, err
	}

	return PresignResult{
		UploadURL: uploadReq.URL,
		ObjectKey: key,
		ExpiresAt: time.Now().UTC().Add(expires),
	}, nil
}
