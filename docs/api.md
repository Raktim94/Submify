# Submify v1 API Contract

Base: `/api/v1`

## Public Endpoints

- `GET /system/bootstrap-status`
- `POST /system/setup`
- `GET /system/health`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /submit/{project_key}` (`x-api-key` required)

## Authenticated Endpoints (Bearer access token)

- `GET /projects`
- `POST /projects`
- `PATCH /projects/{id}`
- `GET /projects/{id}/submissions`
- `DELETE /projects/{id}/submissions/bulk`
- `POST /uploads/presign`
- `GET /projects/{id}/export?format=xlsx|pdf`
- `GET /system/update-status`
- `POST /system/update-trigger`
- `PUT /system/config`
