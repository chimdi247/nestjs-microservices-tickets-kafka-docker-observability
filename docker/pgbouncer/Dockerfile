# Tiny, pinned, reproducible PgBouncer image (no dependency on third-party image tags).
FROM alpine:3.20
RUN apk add --no-cache pgbouncer postgresql16-client \
 && mkdir -p /etc/pgbouncer /var/run/pgbouncer \
 && chown -R pgbouncer:pgbouncer /etc/pgbouncer /var/run/pgbouncer
USER pgbouncer
EXPOSE 6432
CMD ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
