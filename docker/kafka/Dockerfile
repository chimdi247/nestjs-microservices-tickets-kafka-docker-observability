FROM confluentinc/cp-kafka:7.5.0
USER root
# Prometheus JMX exporter as a java agent -> exposes broker JMX (request latency, ISR, ...) on :7071
RUN mkdir -p /opt/jmx \
 && curl -fsSL -o /opt/jmx/jmx_prometheus_javaagent.jar \
      https://repo1.maven.org/maven2/io/prometheus/jmx/jmx_prometheus_javaagent/1.0.1/jmx_prometheus_javaagent-1.0.1.jar \
 && chmod 644 /opt/jmx/jmx_prometheus_javaagent.jar
COPY kafka-jmx.yml /opt/jmx/kafka-jmx.yml
RUN chmod 644 /opt/jmx/kafka-jmx.yml
USER appuser
