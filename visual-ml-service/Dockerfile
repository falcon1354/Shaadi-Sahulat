FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
# CPU-only PyTorch keeps the image far smaller than the default CUDA wheels.
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
# Port 5002 is fixed in config.py. Set VISUAL_ML_HOST=:: in Railway so the private network can reach it.
EXPOSE 5002
CMD ["python", "app.py"]
