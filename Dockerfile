# =============================================================================
# Dockerfile - App "LED / Arduino" (backend Go + frontend estatico)
#
# Que hace: compila el backend (Go) y empaqueta el binario + el frontend
#           estatico en una imagen minima que habla HTTP plano en el 8080.
#
# HTTPS: NO es responsabilidad de este contenedor. Aqui NO se configura TLS;
#        el HTTPS lo termina un reverse proxy (Caddy) por delante, que reenvia
#        al contenedor. Ver docs/caddy/ para un ejemplo.
#
# Estructura del repo (modulo Go en la RAIZ, frontend al lado):
#   go.mod, go.sum, *.go   -> backend
#   frontend/              -> sitio estatico servido por el backend
#
# Contexto de build = la raiz del repo.
#   docker build -t led-arduino .
# =============================================================================

# =============================================================================
# ETAPA 1 (builder): compila el binario Go. Esta imagen NO llega al resultado
# final; solo se usa para producir el ejecutable.
# =============================================================================

# Imagen base con la toolchain de Go 1.27 sobre Alpine
# (coincide con el "go 1.27.0" declarado en go.mod).
FROM golang:1.27-alpine AS builder

# Directorio de trabajo dentro de la etapa de build.
WORKDIR /src

# Copia SOLO los manifiestos de dependencias (go.mod + go.sum) primero.
# Truco de cache: si el codigo cambia pero las deps no, Docker reutiliza esta capa.
COPY go.mod go.sum ./

# Descarga las dependencias a la cache de modulos.
RUN go mod download

# Copia los fuentes Go de la raiz (no hace falta el frontend para compilar).
COPY main.go ./
COPY messages.go ./
COPY server.go ./
COPY session.go ./
COPY websocket.go ./

# Compila el binario con los flags explicados:
#   CGO_ENABLED=0      -> binario 100% estatico (sin libc; portable a Alpine/scratch).
#   GOOS=linux         -> fuerza target Linux (evita sorpresas al construir en Windows).
#   -trimpath          -> quita rutas absolutas del build (reproducible y sin filtrar paths).
#   -ldflags="-s -w"   -> elimina simbolos de debug para achicar el binario.
#   -o /out/app        -> deja el ejecutable en una ruta fija para copiarlo despues.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/app .

# =============================================================================
# ETAPA 2 (runtime): imagen final, minima. Sin Go ni codigo fuente.
# =============================================================================

# Imagen final chica (Alpine) solo para tener shell y crear un usuario sin root.
FROM alpine:3.20

# Crea un grupo y un usuario SIN privilegios para no correr la app como root:
#   addgroup -S app        -> grupo de sistema "app".
#   adduser -S -G app app  -> usuario de sistema "app" dentro del grupo "app".
RUN addgroup -S app && adduser -S -G app app

# Directorio de trabajo de la app en runtime.
# El binario y el frontend quedan como hermanos, igual que en el repo.
WORKDIR /app

# Copia el binario ya compilado desde la etapa builder (no arrastra la toolchain Go).
COPY --from=builder /out/app ./app

# Copia el frontend estatico desde el contexto de build a /app/frontend.
# El backend lo sirve con la ruta relativa "frontend" (ver frontend.go).
COPY frontend/ ./frontend/favicon.svg
COPY frontend/ ./frontend/config.js
COPY frontend/ ./frontend/index.html

# Cambia al usuario sin privilegios creado arriba (menor superficie de ataque).
USER app

# Documenta el puerto en el que escucha la app (8080, fijo en main.go).
# EXPOSE es solo metadato informativo; no publica el puerto por si solo.
EXPOSE 8080

# Comando de arranque del servidor (equivale a ./app dentro de /app).
CMD ["./app"]
