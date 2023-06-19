ARG CIRRUS_AWS_ACCOUNT
FROM ${CIRRUS_AWS_ACCOUNT}.dkr.ecr.eu-central-1.amazonaws.com/base:j17-m3-latest

USER root

ENV NODE_VERSION=16
RUN apt-get update && apt-get install -y nodejs=${NODE_VERSION}.*

USER sonarsource
