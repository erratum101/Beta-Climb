FROM eclipse-temurin:25-jdk AS build
WORKDIR /app/api
COPY api/gradle gradle
COPY api/gradlew api/settings.gradle.kts api/build.gradle.kts ./
COPY migrations /app/migrations
COPY api/src src
RUN chmod +x gradlew && ./gradlew bootJar --no-daemon

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app/api/build/libs/api-1.0-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
