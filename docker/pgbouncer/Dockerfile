# Tiny, pinned, reproducible PgBouncer image (no dependency on third-party image tags).
FROM alpine:3.20
# The Alpine pgbouncer package may not create its own user/group, so create them
# if they are missing (the guard keeps this working if a package update adds them).
RUN apk add --no-cache pgbouncer postgresql16-client \
 && (id pgbouncer >/dev/null 2>&1 || { addgroup -S pgbouncer && adduser -S -D -H -G pgbouncer -s /sbin/nologin pgbouncer; }) \
 && mkdir -p /etc/pgbouncer /var/run/pgbouncer \
 && chown -R pgbouncer:pgbouncer /etc/pgbouncer /var/run/pgbouncer
USER pgbouncer
EXPOSE 6432
CMD ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
