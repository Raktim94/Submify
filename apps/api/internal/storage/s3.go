package storage

import (
	"bytes"
	"context"
	"io"
	"sort"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Config is the credential/endpoint set for whichever S3-compatible
// bucket a caller wants to talk to — this package stays agnostic about
// *why* (presigned uploads vs. a backup destination use it for different
// purposes; see docs/decisions/0009-s3-backup-and-self-update.md for why
// backups deliberately use a separate config from presign.go's per-
// project/per-account credentials rather than reusing them).
type S3Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
}

type ObjectInfo struct {
	Key          string    `json:"key"`
	Size         int64     `json:"size"`
	LastModified time.Time `json:"last_modified"`
}

// UploadObject writes data to cfg.Bucket at key. data is buffered in
// memory by the caller already (backup archives are built fully in-memory
// today, see httpapi.buildBackupArchive) — bytes.Reader is seekable, which
// the SDK needs to compute the request payload checksum without an extra
// buffering pass.
func UploadObject(ctx context.Context, cfg S3Config, key string, data []byte) error {
	c, err := client(ctx, cfg.Endpoint, cfg.AccessKey, cfg.SecretKey)
	if err != nil {
		return err
	}
	_, err = c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(cfg.Bucket),
		Key:           aws.String(key),
		Body:          bytes.NewReader(data),
		ContentLength: aws.Int64(int64(len(data))),
	})
	return err
}

// DownloadObject returns the object body — caller must Close() it.
func DownloadObject(ctx context.Context, cfg S3Config, key string) (io.ReadCloser, error) {
	c, err := client(ctx, cfg.Endpoint, cfg.AccessKey, cfg.SecretKey)
	if err != nil {
		return nil, err
	}
	out, err := c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(cfg.Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	return out.Body, nil
}

// ListObjects returns every object under prefix, newest first — backup
// filenames are timestamp-sortable (submify-backup-YYYYMMDD-HHMMSS.zip),
// so "restore points" and "restore the latest one" both fall out of this
// single call with no separate history table needed.
func ListObjects(ctx context.Context, cfg S3Config, prefix string) ([]ObjectInfo, error) {
	c, err := client(ctx, cfg.Endpoint, cfg.AccessKey, cfg.SecretKey)
	if err != nil {
		return nil, err
	}
	var out []ObjectInfo
	var token *string
	for {
		resp, err := c.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(cfg.Bucket),
			Prefix:            aws.String(prefix),
			ContinuationToken: token,
		})
		if err != nil {
			return nil, err
		}
		for _, obj := range resp.Contents {
			info := ObjectInfo{Key: aws.ToString(obj.Key)}
			if obj.Size != nil {
				info.Size = *obj.Size
			}
			if obj.LastModified != nil {
				info.LastModified = *obj.LastModified
			}
			out = append(out, info)
		}
		if resp.IsTruncated == nil || !*resp.IsTruncated {
			break
		}
		token = resp.NextContinuationToken
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key > out[j].Key })
	return out, nil
}
