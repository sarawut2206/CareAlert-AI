# CareAlert AI — ใช้ได้กับ Railway / Render / Fly.io / VPS ที่มี Docker
#
# สิ่งที่ image นี้ "ไม่มี" โดยตั้งใจ: ฐานข้อมูล ไฟล์รายชื่อจริง ไฟล์รหัสผ่าน
# (ดู .dockerignore) — ข้อมูลจริงอยู่ใน volume ที่ mount ตอนรันเท่านั้น

# ── ขั้นที่ 1: build หน้าเว็บ ─────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY server ./server
COPY web ./web
RUN npm run build

# ── ขั้นที่ 2: ตัวรันจริง (เล็กที่สุด — มีแค่ express) ─────────
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/server ./server
COPY --from=build /app/web/dist ./web/dist

# ฐานข้อมูลอยู่บน volume — ตั้ง DB_PATH=/data/carealert.db แล้ว mount /data
ENV PORT=8787
EXPOSE 8787

# ให้แพลตฟอร์มตรวจสุขภาพที่ /api/health
CMD ["node", "--no-warnings", "server/src/index.js"]
