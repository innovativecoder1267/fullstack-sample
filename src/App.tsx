import { useState } from 'react'
import './App.css'

function App() {
  const [donetasklist, setdonetasklist] = useState<any[]>([])
  const [usertask, setusertask] = useState<string>('')
  const [notdonetasklist, setnotdonetasklist] = useState<any[]>([])
  const handleDelete = (indexToDelete: number) => {
    const updatedList = donetasklist.filter((_, index) => index !== indexToDelete)
    setdonetasklist(updatedList)
    const notdonelist=notdonetasklist.filter((_,index)=>index!==indexToDelete)
    setnotdonetasklist(notdonelist)
  }

  return (
    <>
      <div>
        <h2>Welcome to My frontend</h2>

        <input
          type="text"
          placeholder="Write your task here"
          value={usertask}
          onChange={(e) => setusertask(e.target.value)}
        />

        <button onClick={() => alert(usertask)}>Add Task</button>

        <button
          onClick={() =>
            setdonetasklist([...donetasklist, usertask])
          }
        >
          Mark it as done
        </button>
        <button onClick={()=>setnotdonetasklist([...notdonetasklist,usertask])}>
          Mark it as not done
         </button>

        <h3>Done Task List</h3>

        {donetasklist.map((item, index) => (
          <p key={index}>
            {item}
            <button onClick={() => handleDelete(index)}>
              Delete
            </button>
          </p>
        ))}
        <h3>Not done task list</h3>
        {notdonetasklist.map((item,index)=>(
          <p 
          key={index}>
            {item}
            <button onClick={()=>handleDelete(index)}>
              Delete
            </button>
          </p>
        ))}
      </div>
    </>
  )
}

export default App