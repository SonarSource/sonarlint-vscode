ARG CIRRUS_AWS_ACCOUNT
ARG JDK_VERSION
FROM ${CIRRUS_AWS_ACCOUNT}.dkr.ecr.eu-central-1.amazonaws.com/base:j${JDK_VERSION}-m3-latest

USER root

ENV NODE_VERSION=18
RUN apt-get update && apt-get install -y nodejs=${NODE_VERSION}.* xvfb ffmpeg gettext-base \
  dbus libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2

COPY --chmod=755 .cirrus/xvfb /etc/init.d/

USER sonarsource
