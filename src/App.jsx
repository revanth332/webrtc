import { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

function App() {
  const dataChannelRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const sdpValue = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isCaller, setIsCaller] = useState(false);
  const socketRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);
  const remoteDescriptionSetRef = useRef(false);

  useEffect(() => {
    const socket = io('https://lw38q7hc-3001.inc1.devtunnels.ms');
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
    dataChannelRef.current = dataChannel;

    dataChannel.onmessage = (e) => {
      setMessages((prev) => [...prev, { text: e.data, sender: 'remote' }]);
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
      dataChannelRef.current.onmessage = (e) => {
        setMessages((prev) => [...prev, { text: e.data, sender: 'local' }]);
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
      dataChannelRef.current.send(input);
      setMessages((prev) => [...prev, { text: input, sender: isCaller ? 'local' : 'remote' }]);
      setInput('');
    }
  };

  const handleClose = () => {
    socketRef.current.disconnect();
    peerConnectionRef.current.close();
    dataChannelRef.current.close();
    window.location.reload();
  }

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-800 to-slate-900 text-white flex justify-center items-center p-4">
      <div className="w-full max-w-5xl h-full rounded-lg shadow-2xl flex overflow-hidden">
        
        {/* Chat Box */}
        <div className="flex-1 flex flex-col bg-slate-700 p-4">
          <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2 bg-slate-800 rounded-lg">
            {messages.map((message, index) => (
              <div key={index}>
                {
                  isCaller ?
                   message.sender === 'local' ? <div className='flex justify-end'>
                    <div className='bg-blue-500 text-white p-2 rounded-lg'>
                      {message.text}
                    </div>
                  </div> : 
                  <div className='flex justify-start'>
                    <div className='bg-gray-500 text-white p-2 rounded-lg'>
                      {message.text}
                    </div>
                  </div>
                  :  message.sender === 'remote' ? <div className='flex justify-end'>
                    <div className='bg-blue-500 text-white p-2 rounded-lg'>
                      {message.text}
                    </div>
                  </div> :
                  <div className='flex justify-start'>
                    <div className='bg-gray-500 text-white p-2 rounded-lg'>
                      {message.text}
                    </div>
                  </div>
                }
              </div>

            ))}
          </div>

          {/* Input Area */}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              className="flex-1 p-2 rounded-lg text-white"
              placeholder="Enter message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && hanldeSend()}
            />
            <button
              className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg"
              onClick={hanldeSend}
            >
              Send
            </button>
          </div>

          {/* Control Buttons */}
          <div className="flex justify-between mt-4 gap-2">
            <button
              onClick={makeCall}
              className="bg-blue-500 hover:bg-blue-600 p-2 rounded-lg w-full"
            >
              Call
            </button>
            <button
              onClick={handleClose}
              className="bg-red-500 hover:bg-red-600 p-2 rounded-lg w-full"
            >
              End call
            </button>
          </div>
        </div>

        {/* SDP Box */}
        {/* <div className="w-[35%] bg-slate-700 p-4">
          <textarea
            ref={sdpValue}
            className="w-full h-full p-2 rounded-lg bg-slate-800 text-white"
            placeholder="Enter SDP value"
            rows={20}
          />
        </div> */}
      </div>
    </div>
  );
}

export default App;