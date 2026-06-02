#!/usr/bin/env python3
"""
Beehive Interactive Admin Console
─────────────────────────────────
Menu-driven admin tool for user management, server access, MFA, and sessions.
Run: python interactive_admin.py
"""

import os
import sys
import hashlib
import secrets
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# Add parent directory for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "api"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.prompt import Confirm
from rich import box
from InquirerPy import inquirer
from InquirerPy.separator import Separator

from sqlalchemy import create_engine, select, func, or_
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker, selectinload

import app.models  # noqa: F401 - registers all SQLAlchemy models with Base.metadata
from app.core.base import Base
from app.core.config import get_settings
from app.core.security import hash_password, generate_totp_secret, encrypt_totp_secret, generate_recovery_codes, hash_recovery_codes
from app.models.user import User, UserMfa, UserSession
from app.models.guild import DiscordGuild, UserGuildAccess

console = Console()
settings = get_settings()


def get_admin_database_url() -> URL:
    """Build a host-run sync DB URL. Docker service names do not resolve on Windows."""
    host = "localhost" if settings.postgres_host == "postgres" else settings.postgres_host
    return URL.create(
        "postgresql+psycopg",
        username=settings.postgres_user,
        password=settings.postgres_password,
        host=host,
        port=settings.postgres_port,
        database=settings.postgres_db,
    )


engine = create_engine(get_admin_database_url(), echo=False)
SessionLocal = sessionmaker(bind=engine)


def get_db():
    return SessionLocal()


def clear_terminal():
    command = "cls" if os.name == "nt" else "clear"
    subprocess.run(command, shell=True, check=False)


def select_menu(message: str, choices: list):
    choice = inquirer.select(message=message, choices=choices).execute()
    clear_terminal()
    return choice


def wait_for_enter():
    console.input("\n[dim]Press Enter to continue...[/dim]")


def run_action(action):
    if not action:
        return
    action()
    wait_for_enter()


def ensure_schema():
    """Create missing tables for first-time local setup."""
    Base.metadata.create_all(bind=engine)


# ═══════════════════════════════════════════════════════════
# MAIN MENU
# ═══════════════════════════════════════════════════════════
def main_menu():
    while True:
        clear_terminal()
        console.print(Panel.fit(
            "[bold yellow]Beehive Admin Console[/bold yellow]",
            border_style="yellow",
            padding=(1, 4),
        ))

        choice = select_menu(
            "Select a category:",
            [
                {"name": "Users | User Management", "value": "users"},
                {"name": "Servers | Access Management", "value": "servers"},
                {"name": "Security | MFA", "value": "security"},
                {"name": "Sessions | Session Management", "value": "sessions"},
                {"name": "Reports | System Reports", "value": "reports"},
                Separator(),
                {"name": "Exit", "value": "exit"},
            ],
        )

        if choice == "users":
            user_menu()
        elif choice == "servers":
            server_menu()
        elif choice == "security":
            security_menu()
        elif choice == "sessions":
            session_menu()
        elif choice == "reports":
            reports_menu()
        elif choice == "exit":
            clear_terminal()
            sys.exit(0)


# ═══════════════════════════════════════════════════════════
# USER MANAGEMENT
# ═══════════════════════════════════════════════════════════
def user_menu():
    while True:
        clear_terminal()
        choice = select_menu(
            "User Management:",
            [
                {"name": "Create User", "value": "create"},
                {"name": "List Users", "value": "list"},
                {"name": "Search User", "value": "search"},
                {"name": "View User Details", "value": "view"},
                {"name": "Edit User Profile", "value": "edit"},
                {"name": "Change Username", "value": "change_username"},
                {"name": "Reset User Password", "value": "reset_password"},
                {"name": "Force Password Change on Next Login", "value": "force_password"},
                {"name": "Activate User", "value": "activate"},
                {"name": "Deactivate User", "value": "deactivate"},
                {"name": "Promote to Admin", "value": "promote"},
                {"name": "Revoke Admin", "value": "revoke_admin"},
                {"name": "Delete User", "value": "delete"},
                {"name": "Remove User Avatar", "value": "remove_avatar"},
                Separator(),
                {"name": "Back", "value": "back"},
            ],
        )

        if choice == "back":
            return

        actions = {
            "create": create_user,
            "list": list_users,
            "search": search_users,
            "view": view_user,
            "edit": edit_user,
            "change_username": change_username,
            "reset_password": reset_password,
            "force_password": force_password_change,
            "activate": lambda: toggle_active(True),
            "deactivate": lambda: toggle_active(False),
            "promote": lambda: toggle_admin(True),
            "revoke_admin": lambda: toggle_admin(False),
            "delete": delete_user,
            "remove_avatar": remove_avatar,
        }
        run_action(actions.get(choice))


def create_user():
    console.print("\n[bold cyan]Create New User[/bold cyan]")
    username = inquirer.text(message="Username:", validate=lambda x: len(x) >= 3).execute()
    display_name = inquirer.text(message="Display name:", default=username).execute()
    email = inquirer.text(message="Email (optional):", default="").execute() or None
    password = inquirer.secret(message="Password (min 8 chars):", validate=lambda x: len(x) >= 8).execute()
    is_admin = inquirer.confirm(message="Make admin?", default=False).execute()

    db = get_db()
    try:
        existing = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
        if existing:
            console.print(f"[red]Username '{username}' already exists.[/red]")
            return

        user = User(
            username=username,
            display_name=display_name,
            email=email,
            password_hash=hash_password(password),
            is_admin=is_admin,
        )
        db.add(user)
        db.flush()

        mfa = UserMfa(user_id=user.id, is_enabled=False)
        db.add(mfa)
        db.commit()

        console.print(f"[green]✓ User '{username}' created (ID: {user.id})[/green]")
    except Exception as e:
        db.rollback()
        console.print(f"[red]Error: {e}[/red]")
    finally:
        db.close()


def list_users():
    db = get_db()
    try:
        users = db.execute(select(User).order_by(User.id)).scalars().all()
        if not users:
            console.print("[yellow]No users found.[/yellow]")
            return

        table = Table(title="Users", box=box.ROUNDED, border_style="cyan")
        table.add_column("ID", style="dim")
        table.add_column("Username", style="bold")
        table.add_column("Display Name")
        table.add_column("Email")
        table.add_column("Active", justify="center")
        table.add_column("Admin", justify="center")
        table.add_column("Created")

        for u in users:
            table.add_row(
                str(u.id),
                u.username,
                u.display_name,
                u.email or "-",
                "Yes" if u.is_active else "No",
                "Admin" if u.is_admin else "User",
                u.created_at.strftime("%Y-%m-%d") if u.created_at else "-",
            )
        console.print(table)
    finally:
        db.close()


def search_users():
    query = inquirer.text(message="Search (username/name/email):").execute()
    db = get_db()
    try:
        users = db.execute(
            select(User).where(
                or_(User.username.ilike(f"%{query}%"), User.display_name.ilike(f"%{query}%"), User.email.ilike(f"%{query}%"))
            )
        ).scalars().all()

        if not users:
            console.print("[yellow]No users found.[/yellow]")
            return

        for u in users:
            console.print(f"  [cyan]{u.id}[/cyan] — {u.username} ({u.display_name})")
    finally:
        db.close()


def _select_user(db) -> User | None:
    users = db.execute(select(User).order_by(User.username)).scalars().all()
    if not users:
        console.print("[yellow]No users found.[/yellow]")
        return None

    choices = [{"name": f"{u.username} (ID: {u.id})", "value": u.id} for u in users]
    user_id = select_menu("Select user:", choices)
    return db.execute(select(User).options(selectinload(User.mfa)).where(User.id == user_id)).scalar_one_or_none()


def view_user():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        table = Table(title=f"User: {user.username}", box=box.ROUNDED, border_style="cyan")
        table.add_column("Field", style="bold")
        table.add_column("Value")

        table.add_row("ID", str(user.id))
        table.add_row("Username", user.username)
        table.add_row("Display Name", user.display_name)
        table.add_row("Email", user.email or "-")
        table.add_row("Active", "Yes" if user.is_active else "No")
        table.add_row("Admin", "Yes" if user.is_admin else "No")
        table.add_row("Avatar", user.avatar_path or "None")
        table.add_row("Force Password Change", "Yes" if user.force_password_change else "No")
        table.add_row("MFA Enabled", "Yes" if (user.mfa and user.mfa.is_enabled) else "No")
        table.add_row("Created", str(user.created_at))
        table.add_row("Last Login", str(user.last_login_at) if user.last_login_at else "Never")

        console.print(table)
    finally:
        db.close()


def edit_user():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        display_name = inquirer.text(message="Display name:", default=user.display_name).execute()
        email = inquirer.text(message="Email:", default=user.email or "").execute() or None

        user.display_name = display_name
        user.email = email
        user.updated_at = datetime.now(timezone.utc)
        db.commit()
        console.print("[green]✓ User profile updated.[/green]")
    finally:
        db.close()


def change_username():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        new_username = inquirer.text(message="New username:", validate=lambda x: len(x) >= 3).execute()
        existing = db.execute(select(User).where(User.username == new_username)).scalar_one_or_none()
        if existing:
            console.print(f"[red]Username '{new_username}' already taken.[/red]")
            return

        if Confirm.ask(f"Change username from '{user.username}' to '{new_username}'?"):
            user.username = new_username
            user.updated_at = datetime.now(timezone.utc)
            db.commit()
            console.print("[green]✓ Username changed.[/green]")
    finally:
        db.close()


def reset_password():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        password = inquirer.secret(message="New password (min 8 chars):", validate=lambda x: len(x) >= 8).execute()
        if Confirm.ask(f"Reset password for '{user.username}'?"):
            user.password_hash = hash_password(password)
            user.updated_at = datetime.now(timezone.utc)
            db.commit()
            console.print("[green]✓ Password reset.[/green]")
    finally:
        db.close()


def force_password_change():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return
        user.force_password_change = True
        db.commit()
        console.print(f"[green]✓ {user.username} will be forced to change password on next login.[/green]")
    finally:
        db.close()


def toggle_active(active: bool):
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return
        action = "Activate" if active else "Deactivate"
        if Confirm.ask(f"{action} user '{user.username}'?"):
            user.is_active = active
            user.updated_at = datetime.now(timezone.utc)
            db.commit()
            console.print(f"[green]✓ User {'activated' if active else 'deactivated'}.[/green]")
    finally:
        db.close()


def toggle_admin(admin: bool):
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return
        action = "Promote to admin" if admin else "Revoke admin"
        if Confirm.ask(f"{action} for '{user.username}'?"):
            user.is_admin = admin
            user.updated_at = datetime.now(timezone.utc)
            db.commit()
            console.print(f"[green]✓ {'Promoted to admin' if admin else 'Admin access revoked'}.[/green]")
    finally:
        db.close()


def delete_user():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return
        if Confirm.ask(f"[red]DELETE user '{user.username}'? This cannot be undone.[/red]"):
            db.delete(user)
            db.commit()
            console.print("[green]✓ User deleted.[/green]")
    finally:
        db.close()


def remove_avatar():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return
        if user.avatar_path:
            # Delete file
            avatar_file = Path(user.avatar_path)
            if avatar_file.exists():
                avatar_file.unlink()
            user.avatar_path = None
            user.updated_at = datetime.now(timezone.utc)
            db.commit()
            console.print("[green]✓ Avatar removed.[/green]")
        else:
            console.print("[yellow]User has no avatar.[/yellow]")
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
# SERVER ACCESS MANAGEMENT
# ═══════════════════════════════════════════════════════════
def server_menu():
    while True:
        clear_terminal()
        choice = select_menu(
            "Server Access Management:",
            [
                {"name": "List Guilds", "value": "list"},
                {"name": "Register Guild", "value": "register"},
                {"name": "Assign User Access", "value": "assign"},
                {"name": "Remove User Access", "value": "remove"},
                {"name": "View User Permissions", "value": "view"},
                Separator(),
                {"name": "Back", "value": "back"},
            ],
        )

        if choice == "back":
            return

        actions = {
            "list": list_guilds,
            "register": register_guild,
            "assign": assign_access,
            "remove": remove_access,
            "view": view_permissions,
        }
        run_action(actions.get(choice))


def list_guilds():
    db = get_db()
    try:
        guilds = db.execute(select(DiscordGuild).order_by(DiscordGuild.id)).scalars().all()
        if not guilds:
            console.print("[yellow]No guilds registered.[/yellow]")
            return

        table = Table(title="Discord Guilds", box=box.ROUNDED, border_style="cyan")
        table.add_column("ID", style="dim")
        table.add_column("Discord ID", style="bold")
        table.add_column("Name")
        table.add_column("Created")

        for g in guilds:
            table.add_row(str(g.id), g.discord_guild_id, g.name or "-", str(g.created_at)[:10])
        console.print(table)
    finally:
        db.close()


def register_guild():
    discord_id = inquirer.text(message="Discord Guild ID:").execute()
    name = inquirer.text(message="Guild name (optional):", default="").execute() or None

    db = get_db()
    try:
        existing = db.execute(select(DiscordGuild).where(DiscordGuild.discord_guild_id == discord_id)).scalar_one_or_none()
        if existing:
            console.print(f"[red]Guild {discord_id} already registered.[/red]")
            return

        guild = DiscordGuild(discord_guild_id=discord_id, name=name)
        db.add(guild)
        db.commit()
        console.print(f"[green]✓ Guild registered (ID: {guild.id})[/green]")
    finally:
        db.close()


def assign_access():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        guilds = db.execute(select(DiscordGuild).order_by(DiscordGuild.name)).scalars().all()
        if not guilds:
            console.print("[yellow]No guilds registered.[/yellow]")
            return

        guild_choices = [{"name": f"{g.name or g.discord_guild_id} (ID: {g.id})", "value": g.id} for g in guilds]
        guild_id = select_menu("Select guild:", guild_choices)

        role = select_menu("Role:", ["viewer", "dj", "moderator", "admin"])

        existing = db.execute(
            select(UserGuildAccess).where(UserGuildAccess.user_id == user.id, UserGuildAccess.guild_id == guild_id)
        ).scalar_one_or_none()

        if existing:
            existing.role = role
            db.commit()
            console.print(f"[green]✓ Updated role to '{role}'.[/green]")
        else:
            access = UserGuildAccess(user_id=user.id, guild_id=guild_id, role=role)
            db.add(access)
            db.commit()
            console.print(f"[green]✓ Access granted with role '{role}'.[/green]")
    finally:
        db.close()


def remove_access():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        accesses = db.execute(
            select(UserGuildAccess).options(selectinload(UserGuildAccess.guild)).where(UserGuildAccess.user_id == user.id)
        ).scalars().all()

        if not accesses:
            console.print("[yellow]User has no guild access.[/yellow]")
            return

        choices = [
            {"name": f"{a.guild.name or a.guild.discord_guild_id} ({a.role})", "value": a.id}
            for a in accesses
        ]
        access_id = select_menu("Remove access for:", choices)

        if Confirm.ask("Remove this access?"):
            access = db.execute(select(UserGuildAccess).where(UserGuildAccess.id == access_id)).scalar_one()
            db.delete(access)
            db.commit()
            console.print("[green]✓ Access removed.[/green]")
    finally:
        db.close()


def view_permissions():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        accesses = db.execute(
            select(UserGuildAccess).options(selectinload(UserGuildAccess.guild)).where(UserGuildAccess.user_id == user.id)
        ).scalars().all()

        if not accesses:
            console.print("[yellow]User has no guild access.[/yellow]")
            return

        table = Table(title=f"Permissions for {user.username}", box=box.ROUNDED)
        table.add_column("Guild")
        table.add_column("Discord ID")
        table.add_column("Role")

        for a in accesses:
            table.add_row(a.guild.name or "-", a.guild.discord_guild_id, a.role)
        console.print(table)
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
# SECURITY & MFA
# ═══════════════════════════════════════════════════════════
def security_menu():
    while True:
        clear_terminal()
        choice = select_menu(
            "Security & MFA:",
            [
                {"name": "View MFA Status", "value": "mfa_status"},
                {"name": "Reset/Disable User MFA", "value": "reset_mfa"},
                Separator(),
                {"name": "Back", "value": "back"},
            ],
        )

        if choice == "back":
            return
        elif choice == "mfa_status":
            run_action(mfa_status)
        elif choice == "reset_mfa":
            run_action(reset_mfa)


def mfa_status():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        mfa = user.mfa
        if mfa and mfa.is_enabled:
            console.print(f"[green]MFA is ENABLED for {user.username}[/green]")
            console.print(f"  Enabled at: {mfa.enabled_at}")
        else:
            console.print(f"[yellow]MFA is DISABLED for {user.username}[/yellow]")
    finally:
        db.close()


def reset_mfa():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        if Confirm.ask(f"[red]Reset MFA for '{user.username}'? This will disable their 2FA.[/red]"):
            if user.mfa:
                user.mfa.is_enabled = False
                user.mfa.totp_secret_encrypted = None
                user.mfa.recovery_codes_hash = None
                user.mfa.enabled_at = None
                user.mfa.updated_at = datetime.now(timezone.utc)
                db.commit()
                console.print("[green]✓ MFA reset/disabled.[/green]")
            else:
                console.print("[yellow]User has no MFA record.[/yellow]")
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
# SESSION MANAGEMENT
# ═══════════════════════════════════════════════════════════
def session_menu():
    while True:
        clear_terminal()
        choice = select_menu(
            "Session Management:",
            [
                {"name": "View Active Sessions", "value": "view"},
                {"name": "Force Logout User", "value": "logout"},
                {"name": "Force Logout All Sessions", "value": "logout_all"},
                Separator(),
                {"name": "Back", "value": "back"},
            ],
        )

        if choice == "back":
            return
        elif choice == "view":
            run_action(view_sessions)
        elif choice == "logout":
            run_action(force_logout)
        elif choice == "logout_all":
            run_action(force_logout_all)


def view_sessions():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        sessions = db.execute(
            select(UserSession).where(
                UserSession.user_id == user.id,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > datetime.now(timezone.utc),
            ).order_by(UserSession.created_at.desc())
        ).scalars().all()

        if not sessions:
            console.print("[yellow]No active sessions.[/yellow]")
            return

        table = Table(title=f"Active Sessions for {user.username}", box=box.ROUNDED)
        table.add_column("ID")
        table.add_column("IP")
        table.add_column("User Agent")
        table.add_column("Created")
        table.add_column("Expires")

        for s in sessions:
            table.add_row(
                str(s.id),
                s.ip_address or "-",
                (s.user_agent[:40] + "...") if s.user_agent and len(s.user_agent) > 40 else (s.user_agent or "-"),
                str(s.created_at)[:19],
                str(s.expires_at)[:19],
            )
        console.print(table)
    finally:
        db.close()


def force_logout():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        sessions = db.execute(
            select(UserSession).where(
                UserSession.user_id == user.id,
                UserSession.revoked_at.is_(None),
            )
        ).scalars().all()

        if not sessions:
            console.print("[yellow]No active sessions.[/yellow]")
            return

        choices = [{"name": f"Session {s.id} ({s.ip_address or 'Unknown IP'})", "value": s.id} for s in sessions]
        session_id = select_menu("Select session to revoke:", choices)

        session = db.execute(select(UserSession).where(UserSession.id == session_id)).scalar_one()
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()
        console.print("[green]✓ Session revoked.[/green]")
    finally:
        db.close()


def force_logout_all():
    db = get_db()
    try:
        user = _select_user(db)
        if not user:
            return

        if Confirm.ask(f"Revoke ALL sessions for '{user.username}'?"):
            sessions = db.execute(
                select(UserSession).where(
                    UserSession.user_id == user.id,
                    UserSession.revoked_at.is_(None),
                )
            ).scalars().all()

            now = datetime.now(timezone.utc)
            for s in sessions:
                s.revoked_at = now
            db.commit()
            console.print(f"[green]✓ {len(sessions)} session(s) revoked.[/green]")
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
# REPORTS
# ═══════════════════════════════════════════════════════════
def reports_menu():
    while True:
        clear_terminal()
        choice = select_menu(
            "Reports:",
            [
                {"name": "User Summary", "value": "summary"},
                Separator(),
                {"name": "Back", "value": "back"},
            ],
        )

        if choice == "back":
            return
        elif choice == "summary":
            run_action(user_summary)


def user_summary():
    db = get_db()
    try:
        total = db.execute(select(func.count(User.id))).scalar() or 0
        active = db.execute(select(func.count(User.id)).where(User.is_active == True)).scalar() or 0
        admins = db.execute(select(func.count(User.id)).where(User.is_admin == True)).scalar() or 0
        guilds = db.execute(select(func.count(DiscordGuild.id))).scalar() or 0

        table = Table(title="System Summary", box=box.ROUNDED, border_style="green")
        table.add_column("Metric", style="bold")
        table.add_column("Value", justify="right")

        table.add_row("Total Users", str(total))
        table.add_row("Active Users", str(active))
        table.add_row("Inactive Users", str(total - active))
        table.add_row("Admin Users", str(admins))
        table.add_row("Registered Guilds", str(guilds))

        console.print(table)
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════
if __name__ == "__main__":
    try:
        ensure_schema()

        # Test DB connection
        db = get_db()
        db.execute(select(1))
        db.close()
        console.print("[green]✓ Database connected.[/green]")
    except Exception as e:
        console.print(f"[red]Failed to connect to database: {e}[/red]")
        console.print("[yellow]Make sure PostgreSQL is running and .env is configured.[/yellow]")
        sys.exit(1)

    main_menu()
