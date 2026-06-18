from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, tutor
from core.config import settings

app = FastAPI(
    title="Homeschool Tutor API",
    description="Agentic AI tutor backend — Charlotte Mason + Socratic method, powered by Claude",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tutor.router)


@app.get("/health")
async def health():
    return {"status": "ok", "tutor_model": settings.tutor_model}
