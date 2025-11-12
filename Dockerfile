# syntax = docker/dockerfile:1

# This Dockerfile is designed for production, not development. Use with Kamal or build'n'run by hand:
# docker build -t xibo-web .
# docker run -d -p 3000:3000 --name xibo-web -e RAILS_MASTER_KEY=<value from xibo_web/config/master.key> xibo-web

# Make sure RUBY_VERSION matches the Ruby version in xibo_web/.ruby-version
ARG RUBY_VERSION=3.3.6
FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base

# Project root
WORKDIR /app

# Install base packages
RUN apt-get update -qq && \
    apt-get install \
        --no-install-recommends \
        -y \
        cmake \
        curl \
        libjemalloc2 \
        sqlite3 \
        libvips \
        libyaml-dev \
        sassc && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install supercronic for non-root cron support
ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.34/supercronic-linux-amd64 \
    SUPERCRONIC_SHA1SUM=e8631edc1775000d119b70fd40339a7238eece14 \
    SUPERCRONIC=supercronic-linux-amd64

RUN curl -fsSLO "$SUPERCRONIC_URL" \
 && echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - \
 && chmod +x "$SUPERCRONIC" \
 && mv "$SUPERCRONIC" "/usr/local/bin/${SUPERCRONIC}" \
 && ln -s "/usr/local/bin/${SUPERCRONIC}" /usr/local/bin/supercronic

# Set production environment (can be overridden with build args)
ARG RAILS_ENV=production
ARG BUNDLE_WITHOUT=development
ENV RAILS_ENV="${RAILS_ENV}" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="${BUNDLE_WITHOUT}"

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build gems
RUN apt-get update -qq && \
    apt-get install \
        --no-install-recommends \
        -y \
        build-essential \
        git \
        libssl-dev \
        pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install application gems
COPY xibo_web/Gemfile xibo_web/Gemfile.lock ./xibo_web/
RUN cd xibo_web && MAKE="make --jobs 4" bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git

# Copy entire application code (includes lib/, xibo, swagger.json, etc.)
COPY . .

# Precompile assets for production without requiring secret key
RUN cd xibo_web && SECRET_KEY_BASE_DUMMY=1 bundle exec rails assets:precompile

# Final stage for app image
FROM base

# Copy built artifacts: gems, application
COPY --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --from=build /app /app

# Run and own only the runtime files as a non-root user for security
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash && \
    mkdir -p xibo_web/db xibo_web/log xibo_web/storage xibo_web/tmp && \
    chown -R rails:rails xibo_web/db xibo_web/log xibo_web/storage xibo_web/tmp
USER 1000:1000

# Set working directory to Rails app
WORKDIR /app/xibo_web

# Entrypoint prepares the database.
ENTRYPOINT ["/app/xibo_web/bin/docker-entrypoint"]

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD ["./bin/rails", "server"]
