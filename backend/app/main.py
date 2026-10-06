from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import settings
from app.repository import get_repository
from app.services.advisor import prewarm


@asynccontextmanager
async def lifespan(_: FastAPI):
    prewarm(get_repository())
    yield


app = FastAPI(title="Цифровой двойник завода АЛЛЮР", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix="/api")
