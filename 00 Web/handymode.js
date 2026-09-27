(() => {
  const root = document.documentElement;

  const mobileFromUserAgentData = () => {
    if (!navigator.userAgentData || typeof navigator.userAgentData.mobile !== "boolean") {
      return null;
    }
    return navigator.userAgentData.mobile;
  };

  const mobileFromUserAgent = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
  };

  const coarseBrowserMode = () => {
    if (!window.matchMedia) {
      return false;
    }
    return window.matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;
  };

  const userAgentDataResult = mobileFromUserAgentData();
  const isHandymode = userAgentDataResult === null
    ? mobileFromUserAgent() || coarseBrowserMode()
    : userAgentDataResult || coarseBrowserMode();

  root.classList.toggle("handymode", isHandymode);
})();
