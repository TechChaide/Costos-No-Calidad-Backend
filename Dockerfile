# Dockerfile para la carpeta /Backend

# Usar una imagen base oficial de Node.js con Alpine Linux
FROM node:18-alpine

RUN apk update && apk add --no-cache tzdata curl

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar los archivos de dependencias e instalarlas
COPY package*.json ./
RUN npm install

# Copiar el resto del código del backend
COPY . .

# Exponer el puerto en el que corre tu API
EXPOSE 5410

# Dale permisos de ejecución al script de inicio
RUN chmod +x ./entrypoint.sh

# Establece el script como el comando a ejecutar al iniciar el contenedor
CMD ["./entrypoint.sh"]
