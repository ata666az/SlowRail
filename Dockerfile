# Railway deployment image: DNSTT + BadVPN UDPGW + HTTPS/DoH gateway + OpenSSH.
FROM golang:1.25-bookworm AS dnstt-build
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates cmake build-essential \
    && rm -rf /var/lib/apt/lists/*

# Build DNSTT binaries.
RUN git clone --depth 1 https://github.com/Mygod/dnstt.git /src/dnstt
WORKDIR /src/dnstt/dnstt-server
RUN go build -trimpath -ldflags="-s -w" -o /out-dnstt-server .
WORKDIR /src/dnstt
RUN go build -trimpath -ldflags="-s -w" -o /out-dnstt-client ./dnstt-client
COPY cmd/pubkey/main.go /tmp/pubkey.go
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out-dnstt-pubkey /tmp/pubkey.go

# Build BadVPN's TCP-based UDP gateway used by SSH clients on port 7300.
RUN git clone --depth 1 https://github.com/ambrop72/badvpn.git /src/badvpn \
    && cmake -S /src/badvpn -B /src/badvpn/badvpn-build \
       -DBUILD_NOTHING_BY_DEFAULT=1 -DBUILD_UDPGW=1 \
    && cmake --build /src/badvpn/badvpn-build --parallel 2 \
    && test -x /src/badvpn/badvpn-build/udpgw/badvpn-udpgw

FROM node:22-bookworm-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server passwd ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /run/sshd /opt/dnstt /app/gateway

COPY --from=dnstt-build /out-dnstt-server /usr/local/bin/dnstt-server
COPY --from=dnstt-build /out-dnstt-client /usr/local/bin/dnstt-client
COPY --from=dnstt-build /out-dnstt-pubkey /usr/local/bin/dnstt-pubkey
COPY --from=dnstt-build /src/badvpn/badvpn-build/udpgw/badvpn-udpgw /usr/local/bin/badvpn-udpgw
COPY gateway/doh-gateway.js /app/gateway/doh-gateway.js
COPY start.js /app/start.js
COPY ssh/sshd_config /etc/ssh/sshd_config

WORKDIR /app
EXPOSE 8080
CMD ["node", "/app/start.js"]
