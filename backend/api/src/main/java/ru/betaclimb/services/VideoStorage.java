package ru.betaclimb.services;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.time.Duration;

@Service
public class VideoStorage {
    private final S3Client client;
    private final S3Presigner presigner;
    private final String bucket;

    public VideoStorage(@Value("${S3__ENDPOINT_URL:https://storage.yandexcloud.net}") URI endpoint,
                        @Value("${S3__REGION_NAME:ru-central1}") String regionName,
                        @Value("${S3__BUCKET_NAME:}") String bucket,
                        @Value("${S3__ACCESS_KEY:}") String accessKey,
                        @Value("${S3__SECRET_KEY:}") String secretKey) {
        this.bucket = bucket;
        AwsCredentialsProvider credentials = () -> {
            if (accessKey.isBlank() || secretKey.isBlank() || bucket.isBlank()) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Хранилище видео не настроено");
            }
            return AwsBasicCredentials.create(accessKey, secretKey);
        };
        var region = Region.of(regionName);
        var config = S3Configuration.builder().pathStyleAccessEnabled(true).chunkedEncodingEnabled(false).build();
        client = S3Client.builder().endpointOverride(endpoint).region(region).serviceConfiguration(config)
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .credentialsProvider(credentials).build();
        presigner = S3Presigner.builder().endpointOverride(endpoint).region(region)
                .serviceConfiguration(config).credentialsProvider(credentials).build();
    }

    public void upload(String key, MultipartFile file, String contentType) {
        var body = RequestBody.fromContentProvider(() -> {
            try {
                return file.getInputStream();
            } catch (IOException error) {
                throw new UncheckedIOException(error);
            }
        }, file.getSize(), contentType);
        try {
            client.putObject(request -> request.bucket(bucket).key(key).contentType(contentType), body);
        } catch (SdkException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Не удалось сохранить видео в хранилище");
        }
    }

    public void delete(String key) {
        client.deleteObject(request -> request.bucket(bucket).key(key));
    }

    public URI inlineUrl(String key) {
        return URI.create(presigner.presignGetObject(request -> request.signatureDuration(Duration.ofMinutes(15))
                .getObjectRequest(object -> object.bucket(bucket).key(key).responseContentDisposition("inline")))
                .url().toExternalForm());
    }

    @PreDestroy
    public void close() {
        presigner.close();
        client.close();
    }
}
