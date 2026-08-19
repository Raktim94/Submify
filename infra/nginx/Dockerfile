# Bakes nginx.conf into the image instead of requiring a bind-mounted host
# file — CasaOS/ZimaOS app-store installs never have repo access, only what
# the compose file's image + declared volumes provide.
FROM nginx:1.31-alpine
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 2512
