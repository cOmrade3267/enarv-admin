# Backend API Handoff Note

Generated at: 2026-04-16T15:54:56.984Z
Total actionable issues: 26

## Route Missing
Count: 15
- `PATCH /books/test-id` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot PATCH /books/test-id</pre> </body> </html>
- `POST /books` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot POST /books</pre> </body> </html>
- `PATCH /books/test-id/stock` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot PATCH /books/test-id/stock</pre> </body> </html>
- `POST /books/bulk-upload` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot POST /books/bulk-upload</pre> </body> </html>
- `GET /orders/test-id` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot GET /orders/test-id</pre> </body> </html>
- `GET /admin/notifications/history` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot GET /admin/notifications/history</pre> </body> </html>
- `GET /admin/featured-authors` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot GET /admin/featured-authors</pre> </body> </html>
- `POST /admin/featured-authors` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot POST /admin/featured-authors</pre> </body> </html>
- `DELETE /admin/featured-authors/test-id` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot DELETE /admin/featured-authors/test-id</pre> </body> </html>
- `PATCH /admin/users/test-id/permissions` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot PATCH /admin/users/test-id/permissions</pre> </body> </html>
- `PATCH /admin/users/test-id/role` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot PATCH /admin/users/test-id/role</pre> </body> </html>
- `PATCH /admin/users/test-id` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot PATCH /admin/users/test-id</pre> </body> </html>
- `PATCH /clubs/test-id/status` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot PATCH /clubs/test-id/status</pre> </body> </html>
- `PATCH /clubs/test-id/posts/test-post/pin` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot PATCH /clubs/test-id/posts/test-post/pin</pre> </body> </html>
- `PATCH /clubs/test-id/posts/test-post/highlight` -> 404 | <!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <title>Error</title> </head> <body> <pre>Cannot PATCH /clubs/test-id/posts/test-post/highlight</pre> </body> </html>

## Validation Schema Mismatch
Count: 6
- `POST /admin/notifications/send` -> 400 | Invalid target group parameters.
- `POST /deals` -> 400 | "dealPrice" is required
- `POST /clubs` -> 400 | "slug" is required
- `POST /admin/books/bulk` -> 400 | {"total_processed":1,"successful":[],"failed":[{"key":"books","title":"Unknown Title","reason":"Missing or invalid 'title'"}]}
- `POST /wallet/admin/credit` -> 400 | "description" is required
- `POST /wallet/admin/deduct` -> 400 | "description" is required

## Permission Issue
Count: 2
- `PATCH /clubs/test-id` -> 403 | Forbidden: You do not have the required permissions for this action.
- `DELETE /clubs/test-id/members/test-user` -> 403 | Forbidden: You do not have the required permissions for this action.

## Internal Server Error / Timeout
Count: 2
- `POST /admin/kill-switch` -> ERROR | The operation was aborted due to timeout
- `GET /blogs/admin/upload-url` -> 500 | Error generating upload URL

## Other
Count: 1
- `POST /blogs` -> 201 | {"id":"89310d44-231f-4b7b-a1b5-51d98269559a","title":"API test blog","content":"Diagnostic post","category":"test","cover_url":null,"read_time_minutes":1,"author_id":"5aYo7wVCxIg4cgfNvL8NK25H8jg1","is_published":false,"created_at":"2026-04-16T15:50:10.221Z","updated_at":"2026-04-16T15:50:10.221Z"}

## Notes
- Source file: `api_backend_actionable_issues.tsv`
- All entries include params/body in source TSV for deeper debugging.
