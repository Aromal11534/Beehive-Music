FROM ghcr.io/lavalink-devs/lavalink:4.2.2-alpine

USER root
ARG YOUTUBE_PLUGIN_VERSION=1.18.2
ARG YOUTUBE_PLUGIN_SHA256=dd4b3bce50dbc7582c80776bad47bad87bef1dc683c69d66ab4a084aa3006238
RUN mkdir -p /opt/Lavalink/plugins \
    && wget -q \
      -O "/opt/Lavalink/plugins/youtube-plugin-${YOUTUBE_PLUGIN_VERSION}.jar" \
      "https://github.com/lavalink-devs/youtube-source/releases/download/${YOUTUBE_PLUGIN_VERSION}/youtube-plugin-${YOUTUBE_PLUGIN_VERSION}.jar" \
    && echo "${YOUTUBE_PLUGIN_SHA256}  /opt/Lavalink/plugins/youtube-plugin-${YOUTUBE_PLUGIN_VERSION}.jar" | sha256sum -c - \
    && chown -R lavalink:lavalink /opt/Lavalink/plugins

USER lavalink
