"use client"
import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Upload, FileText, CheckCircle, AlertCircle, XCircle } from "lucide-react"

export default function InboxPage() {
  const { getToken } = useAuth()
  const [loading, setLoading] = useState(false)
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [textInput, setTextInput] = useState("")
  const [fileInput, setFileInput] = useState<File | null>(null)
  
  useEffect(() => {
    fetchOpportunities()
    // Polling since processing happens async
    const interval = setInterval(fetchOpportunities, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchOpportunities = async () => {
    try {
      const token = await getToken()
      const res = await fetch("http://localhost:8000/api/inbox/opportunities", {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setOpportunities(data.opportunities)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return
    setLoading(true)
    try {
      const token = await getToken()
      await fetch("http://localhost:8000/api/inbox/text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: textInput, source_type: "text" })
      })
      setTextInput("")
      fetchOpportunities()
    } finally {
      setLoading(false)
    }
  }
  
  const handleFileUpload = async () => {
    if (!fileInput) return
    setLoading(true)
    try {
      const token = await getToken()
      const formData = new FormData()
      formData.append("file", fileInput)
      // Determine type crudely
      const ext = fileInput.name.split('.').pop()?.toLowerCase()
      const sType = ['pdf', 'docx', 'xlsx', 'csv'].includes(ext!) ? ext : 'image'
      formData.append("source_type", sType!)
      
      await fetch("http://localhost:8000/api/inbox/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      setFileInput(null)
      fetchOpportunities()
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string, verifyStatus: string) => {
    if (status === 'verified') return <Badge className="bg-green-500">Verified</Badge>
    if (status === 'unverified') {
        if (verifyStatus === 'promo_funnel') return <Badge variant="destructive">Promo Funnel</Badge>
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600">Unverified Source</Badge>
    }
    return <Badge variant="outline">{status}</Badge>
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Opportunity Inbox</h1>
        <p className="text-muted-foreground">Paste messages from WhatsApp, Telegram, or LinkedIn. Upload screenshots or lists.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Submit Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="text">
                <TabsList className="w-full grid grid-cols-2 mb-4">
                  <TabsTrigger value="text">Text/Links</TabsTrigger>
                  <TabsTrigger value="file">File/Image</TabsTrigger>
                </TabsList>
                
                <TabsContent value="text" className="space-y-4">
                  <Textarea 
                    placeholder="Paste job descriptions or links here..." 
                    className="min-h-[200px]"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                  />
                  <Button className="w-full" onClick={handleTextSubmit} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Extract Opportunities
                  </Button>
                </TabsContent>
                
                <TabsContent value="file" className="space-y-4">
                  <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center space-y-4">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <Input 
                      type="file" 
                      className="max-w-xs" 
                      onChange={(e) => setFileInput(e.target.files?.[0] || null)}
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Supports PDF, DOCX, XLSX, CSV, and Screenshots
                    </p>
                  </div>
                  <Button className="w-full" onClick={handleFileUpload} disabled={loading || !fileInput}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Upload & Extract
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-4">
          <h3 className="font-semibold text-lg flex items-center justify-between">
            Discovered Opportunities
            <Badge variant="secondary">{opportunities.length}</Badge>
          </h3>
          
          {opportunities.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-20" />
                <p>No opportunities found yet.</p>
                <p className="text-sm">Paste some text or upload a file to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2">
              {opportunities.map((opp) => (
                <Card key={opp.id} className="overflow-hidden">
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-lg">{opp.role_title || "Unknown Role"}</h4>
                        <p className="text-muted-foreground flex items-center gap-2">
                          <span className="font-medium text-foreground">{opp.company || "Unknown Company"}</span>
                          {opp.location && <span>• {opp.location}</span>}
                        </p>
                      </div>
                      <div>
                        {getStatusBadge(opp.status, opp.verification_status)}
                      </div>
                    </div>
                    
                    {opp.extraction_metadata?.experience_req && (
                      <p className="text-sm text-muted-foreground mb-2">
                        Experience: {opp.extraction_metadata.experience_req}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap gap-1 mt-3">
                      {opp.extraction_metadata?.skills?.slice(0, 4).map((skill: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                      ))}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t flex justify-between items-center bg-muted/20 -mx-5 -mb-5 p-4 px-5">
                      <div className="text-xs text-muted-foreground truncate max-w-[60%]">
                        {opp.verified_official_url ? (
                          <a href={opp.verified_official_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                            Official Link
                          </a>
                        ) : opp.original_submitted_url ? (
                          <span className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Third-party: {new URL(opp.original_submitted_url).hostname}
                          </span>
                        ) : "No URL provided"}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="text-destructive">Reject</Button>
                        <Button size="sm">Save to Jobs</Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
