"""System stats endpoint."""

import json
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.core.redis import redis_client
from app.api.v1.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/stats", tags=["Stats"])

class StatsResponse(BaseModel):
    total_users: int
    active_players: int

@router.get("", response_model=StatsResponse)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get overall system statistics."""
    # Get total users
    result = await db.execute(select(func.count(User.id)))
    total_users = result.scalar() or 0

    # Get active players from Redis
    active_players = 0
    keys = await redis_client.keys("player_state:*")
    if keys:
        # Retrieve all states in one go for efficiency if there are many, but since it's a small app, individual gets or mget is fine.
        # Let's use mget for better performance.
        states_raw = await redis_client.mget(keys)
        for state_raw in states_raw:
            if state_raw:
                try:
                    state = json.loads(state_raw)
                    if state.get("isPlaying") and not state.get("isPaused"):
                        active_players += 1
                except json.JSONDecodeError:
                    pass
                
    return StatsResponse(total_users=total_users, active_players=active_players)
