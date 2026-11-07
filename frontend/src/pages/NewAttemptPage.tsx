import { useNavigate } from 'react-router-dom'
import { CaptureGuide } from '../features/capture/CaptureGuide'

export function NewAttemptPage() {
  const navigate = useNavigate()
  const leave = () => navigate('/home')

  return <CaptureGuide onLeave={leave} onDone={leave} />
}
