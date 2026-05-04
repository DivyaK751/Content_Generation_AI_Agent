import SessionClient from './SessionClient'

export async function generateStaticParams() { return [{ id: '_' }] }

export default function Page() {
  return <SessionClient />
}
