# pg_dump (same major version as the db) + rclone for the cloud copy.
FROM postgres:17.6-alpine
RUN apk add --no-cache rclone tzdata coreutils
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
ENV RCLONE_CONFIG=/config/rclone/rclone.conf
ENTRYPOINT ["/usr/local/bin/backup.sh"]
