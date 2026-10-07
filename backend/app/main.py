from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.people import router as people_router
from app.api.routes import router
from app.db import init_db
from app.config import settings
from app.repository import get_repository
from app.services.advisor import prewarm


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    prewarm(get_repository())
    yield


app = FastAPI(title="Цифровой двойник завода АЛЛЮР", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_credentials=True,
    allow_headers=["*"],
)
app.include_router(router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(people_router, prefix="/api")
