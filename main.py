from fastapi import FastAPI, HTTPException, Depends
from sqlalchemy import Column, Integer, String, Boolean, DateTime, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel, Field
import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:5432@localhost:5433/todo_db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String, nullable=True)
    is_complete = Column(Boolean, default=False)
    due_date = Column(DateTime, nullable=True)
    priority = Column(Integer, default=2)  
    category = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

class TaskCreate(BaseModel):
    title: str
    description: str
    is_complete: bool = False
    due_date: datetime
    priority: int = Field(..., ge=1, le=3, description="Priority: 1-high, 2-medium, 3-low")
    category: str

class TaskUpdate(BaseModel):
    title: str
    description: str
    is_complete: bool
    due_date: datetime
    priority: int = Field(..., ge=1, le=3, description="Priority: 1-high, 2-medium, 3-low")
    category: str

app = FastAPI()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/tasks")
def get_tasks(db: Session = Depends(get_db)):
    tasks = db.query(Task).all()
    for task in tasks:
        if task.due_date and task.due_date.tzinfo is None:
            task.due_date = task.due_date.replace(tzinfo=timezone.utc)  
        else:
            task.due_date = task.due_date.astimezone(timezone.utc)
    return tasks

@app.get("/tasks/overdue")
def get_overdue_tasks(db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.due_date < datetime.utcnow(), Task.is_complete == False).all()

@app.get("/tasks/filter")
def filter_tasks(period: str, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    if period == "day":
        start_date, end_date = now, now + timedelta(days=1)
    elif period == "week":
        start_date, end_date = now, now + timedelta(weeks=1)
    elif period == "month":
        start_date, end_date = now, now + timedelta(days=30)
    else:
        raise HTTPException(status_code=400, detail="Invalid period. Use 'day', 'week', or 'month'.")
    
    return db.query(Task).filter(Task.due_date >= start_date, Task.due_date <= end_date).all()

@app.get("/tasks/category/{category}")
def get_tasks_by_category(category: str, db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.category == category).all()

@app.get("/tasks/priority/{priority}")
def get_tasks_by_priority(priority: int, db: Session = Depends(get_db)):
    if priority not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="Invalid priority. Use 1 (high), 2 (medium), or 3 (low).")
    return db.query(Task).filter(Task.priority == priority).all()

@app.post("/tasks")
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    new_task = Task(**task.dict())

    
    if new_task.due_date.tzinfo is None:
        new_task.due_date = new_task.due_date.replace(tzinfo=timezone.utc)
    else:
        new_task.due_date = new_task.due_date.astimezone(timezone.utc)

    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

@app.put("/tasks/{task_id}")
def update_task(task_id: int, updated_task: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    for key, value in updated_task.dict().items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task