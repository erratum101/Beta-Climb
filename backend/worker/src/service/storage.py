import os
from pathlib import Path

import boto3
from botocore.config import Config


class ObjectStorage:
    def __init__(self):
        self.bucket = os.environ["S3__BUCKET_NAME"]
        self.client = boto3.client(
            "s3", endpoint_url=os.environ["S3__ENDPOINT_URL"], region_name=os.environ["S3__REGION_NAME"],
            aws_access_key_id=os.environ["S3__ACCESS_KEY"], aws_secret_access_key=os.environ["S3__SECRET_KEY"],
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    def download(self, key: str, destination: Path) -> None:
        self.client.download_file(self.bucket, key, str(destination))

    def upload(self, source: Path, key: str) -> None:
        content_type = {".mp4": "video/mp4", ".jpg": "image/jpeg", ".json": "application/json"}[source.suffix]
        self.client.upload_file(str(source), self.bucket, key, ExtraArgs={"ContentType": content_type})

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)
