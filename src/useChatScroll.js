import {useLayoutEffect, useRef, useState} from 'react';

export default function useChatScroll(messages, context) {
  const viewport = useRef(null);
  const content = useRef(null);
  const following = useRef(true);
  const lastUser = useRef(null);
  const [showLatest, setShowLatest] = useState(false);
  const jump = () => {
    following.current = true;
    if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
    setShowLatest(false);
  };
  const onScroll = () => {
    const node = viewport.current;
    if (!node) return;
    following.current = node.scrollHeight - node.clientHeight - node.scrollTop < 60;
    setShowLatest(!following.current);
  };
  useLayoutEffect(() => { lastUser.current = null; jump(); }, [context]);
  useLayoutEffect(() => {
    const user = messages.filter(message => message[0] === 'user').at(-1)?.[2];
    if (user !== lastUser.current) { lastUser.current = user; jump(); }
    else if (following.current) jump();
  }, [messages]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => { if (following.current) jump(); });
    if (content.current) observer.observe(content.current);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  return {viewport, content, onScroll, jump, showLatest};
}
