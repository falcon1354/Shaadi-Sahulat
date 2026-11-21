FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
# Port 5001 is fixed in app.py. Set ML_SERVICE_HOST=:: in Railway so the private network can reach it.
EXPOSE 5001
CMD ["python", "app.py"]
