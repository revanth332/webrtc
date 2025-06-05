import { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { buildStyles, CircularProgressbar } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
const SERVER_URL = import.meta.env.VITE_SERVER_ORIGIN;

function App() {
  const dataChannelRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isCaller, setIsCaller] = useState(false);
  const socketRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);
  const remoteDescriptionSetRef = useRef(false);
  const fileBufferRef = useRef(null);
  const [uploadingStatus,setUploadingStatus] = useState(0);
  const [sendingFileId,setSendingFileId] = useState(null);

  useEffect(() => {
    const socket = io(SERVER_URL || 'http://172.17.15.208:3001');
    socketRef.current = socket;
  
    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnectionRef.current = peerConnection;
  
    socket.on('offer', async (data) => {
      console.log("came from caller")
      if (!peerConnection.localDescription && data) {
        await handleOffer(data);
      }
    });
  
    socket.on('answer', async (data) => {
      if(data) await handleAnswer(data);
    });
  
    socket.on('icecandidate', async (data) => {
      if (peerConnectionRef.current.remoteDescription && remoteDescriptionSetRef.current && data) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
      else {
        iceCandidateQueueRef.current.push(data);
      }
    });
  
    peerConnection.onicecandidate = (event) => {
      if (peerConnection.localDescription) {
        socket.emit('icecandidate', event.candidate);
      }
    };
  
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
    };
  }, []);
  
  const handleIceCandidates = async () => {
    while (iceCandidateQueueRef.current.length > 0) {
      const candidate = iceCandidateQueueRef.current.shift();
      if (candidate) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }
  }

  const makeCall = async () => {
    setIsCaller(true);
    const dataChannel = peerConnectionRef.current.createDataChannel('channel');
    dataChannel.bufferedAmountLowThreshold = 256 * 1024;
    dataChannelRef.current = dataChannel;

    dataChannel.onmessage = (e) => {
      const data = e.data;
        if(typeof data === 'string'){
          const message = JSON.parse(data);
          if(message.type === "file-eof"){
            const blob  = new Blob(fileBufferRef.current);
            const url = URL.createObjectURL(blob);
            setMessages((prev) => [...prev, {type:message.type, text: "File received", sender: 'remote',url,name: message.name }]);
            fileBufferRef.current = null;
          }
          else{
            setMessages((prev) => [...prev, {type:message.type, text: message.text, sender: 'remote' }]);
          }
        }
        else{
          if(!fileBufferRef.current){
            fileBufferRef.current = [];
          }
          fileBufferRef.current.push(data);
        }
    };
    dataChannel.onopen = () => {
      alert("connection established")
      console.log('data channel open');
    };
    dataChannel.onerror = (error) => {
      console.error('Data Channel Error:', error);
    };
    dataChannel.onclose = () => {
      console.log('Data Channel Closed');
    };

    const offer = await peerConnectionRef.current.createOffer();

    socketRef.current.emit('offer', offer);

    await peerConnectionRef.current.setLocalDescription(new RTCSessionDescription(offer));
    console.log(JSON.stringify(peerConnectionRef.current.localDescription));
  };

  const handleOffer = async (offer) => {
    setIsCaller(false);
    peerConnectionRef.current.ondatachannel = (e) => {
      dataChannelRef.current = e.channel;
      dataChannelRef.current.bufferedAmountLowThreshold = 256 * 1024;
      dataChannelRef.current.onmessage = (e) => {
        const data = e.data;
        if(typeof data === 'string'){
          const message = JSON.parse(data);
          if(message.type === "file-eof"){
            const blob  = new Blob(fileBufferRef.current);
            const url = URL.createObjectURL(blob);
            setMessages((prev) => [...prev, {type:message.type, text: "File received", sender: 'local',url,name: message.name }]);
            fileBufferRef.current = null;
          }
          else{
            setMessages((prev) => [...prev, {type:message.type, text: message.text, sender: 'local' }]);
          }
        }
        else{
          if(!fileBufferRef.current){
            fileBufferRef.current = [];
          }
          fileBufferRef.current.push(data);
        }
      };
      dataChannelRef.current.onopen = () => {
        alert("connection established")
        console.log('data channel open');
      };
      dataChannelRef.current.onclose = () => {
        window.location.reload();
      }
    };
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
    remoteDescriptionSetRef.current = true;
    await handleIceCandidates();
    const answer = await peerConnectionRef.current.createAnswer();

    socketRef.current.emit('answer', answer);

    await peerConnectionRef.current.setLocalDescription(new RTCSessionDescription(answer));
    console.log(JSON.stringify(peerConnectionRef.current.localDescription));
  };

  const handleAnswer = async (answer) => {
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    remoteDescriptionSetRef.current = true;
    await handleIceCandidates();
    console.log(JSON.stringify(peerConnectionRef.current.remoteDescription));
  };

  const hanldeSend = () => {
    if (input.trim() !== '') {
      const message = {
        type:"text",
        text:input
      }
      dataChannelRef.current.send(JSON.stringify(message));
      setMessages((prev) => [...prev, { type:"text",text: input, sender: isCaller ? 'local' : 'remote' }]);
      setInput('');
    }
  };

  const handleClose = () => {
    socketRef.current.disconnect();
    peerConnectionRef.current.close();
    dataChannelRef.current.close();
    window.location.reload();
  }

  // const sendFile = (file) => {
  //   console.log(file);
  //   setMessages((prev) => [...prev, { text: file.name+" is sent", sender: isCaller ? 'local' : 'remote' }]);
  //   const reader = new FileReader();
  //   let offset = 0;

  //   const chunkSize = 16384; // 16KB

  //   reader.onload = (event) => {
  //     const data = event.target.result;
      
  //     const sendChunk = () => {
  //       if(dataChannelRef.current.bufferedAmount > 16 * 1024 * 1024){
  //         setTimeout(sendChunk,100);
  //         return;
  //       }
  //       dataChannelRef.current.send(data);
  //       offset += data.byteLength;
  
  //       if(offset < file.size){
  //         readSlice(offset);
  //       }
  //       else{
  //         setUploadingStatus(0);
  //         dataChannelRef.current.send(file.name+"EOF");
  //       }
  //     }
      
  //     sendChunk();
  //   }

  //   const readSlice = (offset) => {
  //     setUploadingStatus((offset/file.size)*100);
  //     // console.log(((offset/file.size)*100).toFixed(2)+"%");
  //     const slice = file.slice(offset,offset+chunkSize);
  //     reader.readAsArrayBuffer(slice);
  //   }

  //   readSlice(offset);
  // }

  const sendFile = (file) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
        console.error("Data channel is not open or not available.");
        setMessages((prev) => [...prev, { type:"text",text: `Error: Data channel not open for ${file.name}`, sender: 'system', error: true }]);
        setUploadingStatus(0);
        return;
    }

    console.log("Attempting to send file:", file.name, "size:", file.size);
    setSendingFileId(file.name+messages.length)
    setMessages((prev) => [...prev, { type:"file-send",fileName : file.name,text: `Sending ${file.name}...`, sender: isCaller ? 'local' : 'remote',fileId : file.name+prev.length }]);

    const reader = new FileReader();
    let offset = 0;
    const chunkSize = 16384; // 16KB. This is a good default. Max SCTP message size is often larger, but 16KB is safe.
    // Max RTCDataChannel message size can be up to 256KB or more for ArrayBuffers on some browsers, but SCTP itself fragments.
    // However, the internal buffer we are concerned about is different.

    // Configure bufferedAmountLowThreshold on your data channel, ideally when it's created.
    // This threshold tells the browser when to fire the 'bufferedamountlow' event.
    // A common value is a fraction of the typical max buffer (e.g. 1MB if max buffer is 16MB).
    // If not set, it defaults to 0, meaning the event fires only when the buffer is empty.
    // For this example, let's assume it's set, or we can set it here if the DC is new.
    // Example: dataChannelRef.current.bufferedAmountLowThreshold = 256 * 1024; // 256KB

    const sendMetadata = () => {
        const metadata = {
            type: 'file-meta',
            text: file.name,
            size: file.size,
            fileType: file.type,
        };
        try {
            dataChannelRef.current.send(JSON.stringify(metadata));
            console.log("Sent file metadata for:", file.name);
        } catch (e) {
            console.error("Failed to send file metadata:", e);
            setMessages((prev) => [...prev, { type:"text",text: `Error sending metadata for ${file.name}`, sender: 'system', error: true }]);
            setUploadingStatus(0);
            return false; // Indicate failure
        }
        return true; // Indicate success
    };

    const sendNextChunk = () => {
        // Check if we need to wait for the buffer to drain
        // The HIGH_WATER_MARK should be significantly less than the absolute max buffer of the browser's SCTP stack (often ~16MB).
        // Using 1MB-4MB is a reasonable high water mark to pause sending.
        const HIGH_WATER_MARK = 1 * 1024 * 1024; // 1 MB

        if (dataChannelRef.current.bufferedAmount > HIGH_WATER_MARK) {
            console.log(`Buffer high (${dataChannelRef.current.bufferedAmount} bytes). Pausing send. Waiting for 'bufferedamountlow'.`);
            dataChannelRef.current.onbufferedamountlow = () => {
                // Clean up the event listener once it fires
                dataChannelRef.current.onbufferedamountlow = null;
                console.log("Buffer drained. Resuming send.");
                sendNextChunk(); // Retry sending the current chunk
            };
            return; // Exit and wait for the event
        }

        // If current chunk data is available from reader.onload, send it
        if (reader.readyState === FileReader.LOADING) {
            // This should ideally not happen if logic is correct, means we called sendNextChunk before onload
            console.warn("FileReader still loading, waiting a bit.");
            setTimeout(sendNextChunk, 50); // Small delay and retry
            return;
        }
        
        // If reader.result has data (meaning onload fired for the current slice)
        if (reader.result && reader.result.byteLength > 0) {
            try {
                dataChannelRef.current.send(reader.result); // reader.result is the ArrayBuffer
                offset += reader.result.byteLength;
                setUploadingStatus((offset / file.size) * 100);
            } catch (e) {
                console.error("Error sending chunk:", e);
                // If 'send queue is full' error occurs here, it means our HIGH_WATER_MARK check
                // wasn't enough or something filled the buffer very quickly between the check and send().
                // The 'bufferedamountlow' logic should eventually recover if it was temporary.
                // For persistent errors, you might need to abort.
                setMessages((prev) => [...prev, { type:"text",text: `Error sending chunk for ${file.name}`, sender: 'system', error: true }]);
                setUploadingStatus(0); // Abort on send error
                return;
            }
        }

        // Check if more chunks to read and send
        if (offset < file.size) {
            readSlice(offset); // Read the next slice, which will trigger reader.onload, then sendNextChunk
        } else {
            console.log("Finished sending all chunks for:", file.name);
            try {
                dataChannelRef.current.send(JSON.stringify({ type: 'file-eof', name: file.name }));
                 setMessages((prev) => [...prev, { type:"text",text: `${file.name} sent successfully!`, sender: isCaller ? 'local' : 'remote' }]);
            } catch (e) {
                console.error("Failed to send EOF:", e);
            }
            setUploadingStatus(100); // Or 0 to reset
            // Consider setting uploadingStatus to 0 after a short delay or on acknowledgment from receiver
            setTimeout(() => setUploadingStatus(0), 2000);
        }
    };

    reader.onload = (event) => {
        // event.target.result contains the ArrayBuffer of the chunk
        console.log(`Loaded chunk: offset=${offset}, size=${event.target.result.byteLength}`);
        // Now that the chunk is loaded, try to send it.
        // sendNextChunk will handle buffer checks.
        sendNextChunk();
    };

    reader.onerror = (error) => {
        console.error("FileReader error:", error);
        setMessages((prev) => [...prev, { type:"text",text: `Error reading ${file.name}`, sender: 'system', error: true }]);
        setUploadingStatus(0);
    };

    const readSlice = (o) => {
        console.log(`Reading slice at offset: ${o}`);
        const slice = file.slice(o, o + chunkSize);
        reader.readAsArrayBuffer(slice);
        // The actual sending will happen in reader.onload -> sendNextChunk
    };

    // Start the process
    if (sendMetadata()) {
        setUploadingStatus(0.1); // Indicate start, slightly above 0
        readSlice(offset); // Start reading the first chunk
    }
};
return (
  <div className="h-screen w-screen bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 flex justify-center items-center p-4 font-sans">
    <div className="w-full max-w-5xl h-full md:h-[90vh] rounded-3xl shadow-xl bg-white/70 backdrop-blur-lg border border-white/30 flex overflow-hidden">

      {/* Chat Box */}
      <div className="flex-1 flex flex-col p-6">
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 bg-white/40 rounded-xl p-4 shadow-inner">
          {messages.map((message, index) => (
            <div key={index} className="space-y-1">
              <div className={`flex ${message.sender === (isCaller ? 'local' : 'remote') ? 'justify-end' : 'justify-start'}`}>
                <div>
                 {
                  message.type === "file-send"
                  ? <div className='h-[100px] w-[200px] bg-slate-200 mt-2 flex justify-center items-center rounded-xl'>
                    {sendingFileId === message.fileId && uploadingStatus ? <div className='h-12 w-12'>
                        <CircularProgressbar style={buildStyles({
                          textSize:'20px'
                        })} value={Number(uploadingStatus)} text={`${Number(uploadingStatus.toFixed(1))}%`} />
                        {message.fileName.length > 6 ? message.fileName.substring(0,20)+"..." : message.fileName}
                      </div>
                      : message.fileName.length > 6 ? message.fileName.substring(0,20)+"..." : message.fileName}
                  </div>
                  : <div className={`max-w-xs md:max-w-sm px-4 py-2 rounded-2xl shadow-md ${
                        message.sender === (isCaller ? 'local' : 'remote') ? 'bg-purple-200 text-purple-900' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {message.text} 
                {message.url && (
                  <div>
                    <a
                      className="text-blue-500 hover:underline text-sm"
                      download={message.name}
                      href={message.url}
                    >
                      Download {message.name}
                    </a>
                  </div>
                )}
                    </div>
                 }
        
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="flex gap-2 items-center">
          <input
            type="text"
            className="flex-1 px-4 py-2 rounded-xl bg-white/80 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-300 text-gray-800"
            placeholder="Enter message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && hanldeSend()}
          />
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              onChange={(e) => sendFile(e.target.files[0])}
            />
            <span className="px-4 py-2 bg-purple-200 hover:bg-purple-300 rounded-xl shadow cursor-pointer text-purple-800 text-sm">
              Upload
            </span>
          </label>
          <button
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-pink-500 hover:to-purple-500 text-white px-4 py-2 rounded-xl shadow"
            onClick={hanldeSend}
          >
            Send
          </button>
        </div>

        {/* Control Buttons */}
        <div className="flex justify-between mt-6 gap-4">
          <button
            onClick={makeCall}
            className="bg-gradient-to-r from-green-400 to-blue-400 hover:from-blue-400 hover:to-green-400 text-white py-2 rounded-xl w-full shadow-lg transition-all"
          >
            Call
          </button>
          <button
            onClick={handleClose}
            className="bg-gradient-to-r from-red-400 to-pink-400 hover:from-pink-400 hover:to-red-400 text-white py-2 rounded-xl w-full shadow-lg transition-all"
          >
            End Call
          </button>
        </div>
      </div>
    </div>
  </div>
);

  // return (
  //   <div className="h-screen w-screen bg-gradient-to-br from-slate-800 to-slate-900 text-white flex justify-center items-center p-4">
  //     <div className="w-full max-w-5xl h-full rounded-lg shadow-2xl flex overflow-hidden">
        
  //       {/* Chat Box */}
  //       <div className="flex-1 flex flex-col bg-slate-700 p-4">
  //         <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2 bg-slate-800 rounded-lg">
  //           {messages.map((message, index) => (
  //             <div key={index}>
  //               {
  //                 isCaller ?
  //                  message.sender === 'local' ? <div className='flex justify-end'>
  //                   <div className='bg-blue-500 text-white p-2 rounded-lg'>
  //                     {message.text}
  //                   </div>
  //                 </div> : 
  //                 <div className='flex justify-start'>
  //                   <div className='bg-gray-500 text-white p-2 rounded-lg'>
  //                     {message.text}
  //                   </div>
  //                 </div>
  //                 :  message.sender === 'remote' ? <div className='flex justify-end'>
  //                   <div className='bg-blue-500 text-white p-2 rounded-lg'>
  //                     {message.text}
  //                   </div>
  //                 </div> :
  //                 <div className='flex justify-start'>
  //                   <div className='bg-gray-500 text-white p-2 rounded-lg'>
  //                     {message.text}
  //                   </div>
  //                 </div>
  //               }
  //               {uploadingStatus > 0 && <div className='text-center text-sm'>{uploadingStatus.toFixed(2)}%</div>}
  //               {message.url && <a download={message.name} href={message.url}>download</a>}
  //             </div>

  //           ))}
  //         </div>

  //         {/* Input Area */}
  //         <div className="flex gap-2 items-center">
  //           <input
  //             type="text"
  //             className="flex-1 p-2 rounded-lg text-white"
  //             placeholder="Enter message..."
  //             value={input}
  //             onChange={(e) => setInput(e.target.value)}
  //             onKeyDown={(e) => e.key === 'Enter' && hanldeSend()}
  //           />
  //           <input
  //             type="file"
  //             className="p-2 rounded-lg text-white border"
  //             onChange={(e) => sendFile(e.target.files[0])}
  //           />
  //           <button
  //             className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg"
  //             onClick={hanldeSend}
  //           >
  //             Send
  //           </button>
  //         </div>

  //         {/* Control Buttons */}
  //         <div className="flex justify-between mt-4 gap-2">
  //           <button
  //             onClick={makeCall}
  //             className="bg-blue-500 hover:bg-blue-600 p-2 rounded-lg w-full"
  //           >
  //             Call
  //           </button>
  //           <button
  //             onClick={handleClose}
  //             className="bg-red-500 hover:bg-red-600 p-2 rounded-lg w-full"
  //           >
  //             End call
  //           </button>
  //         </div>
  //       </div>
  //     </div>
  //   </div>
  // );
}

export default App;