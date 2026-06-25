import { Camera, Database, Image, KeyRound, LogOut, Moon, Sun, Trash2, X } from "lucide-react";

import type { PortalThemeMode } from "./portal-theme";
import { useOptionalPortalTheme } from "./portal-theme";

import { useEffect, useRef, useState } from "react";

import { createPortal } from "react-dom";

import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/auth-context";

import { ProfilePhotoCropDialog } from "./ProfilePhotoCropDialog";

import { ProfilePhotoNativeInputs } from "./ProfilePhotoNativeInputs";

import { CurrentUserAvatar } from "./UserAvatar";

import { useAvatarBlob } from "./useAvatarBlob";

import { ChangePasswordDialog } from "./ChangePasswordDialog";

import { useToast } from "./toast-context";



function topbarAvatarSize(className: string): "xs" | "md" {

  return className.includes("erp-top-avatar") ? "xs" : "md";

}



function ProfilePhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {

  useEffect(() => {

    function onKey(event: KeyboardEvent) {

      if (event.key === "Escape") onClose();

    }

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);

  }, [onClose]);



  return createPortal(

    <div className="profile-photo-lightbox" role="dialog" aria-modal="true" aria-label="Profile photo" onClick={onClose}>

      <button

        type="button"

        className="profile-photo-lightbox-close"

        onClick={(e) => {

          e.stopPropagation();

          onClose();

        }}

        aria-label="Close"

      >

        <X size={22} />

      </button>

      <img src={src} alt="" className="profile-photo-lightbox-img" onClick={(e) => e.stopPropagation()} />

    </div>,

    document.body

  );

}



export function ProfileMenuButton({

  className = "db-avatar",

  themeToggle

}: {

  className?: string;

  themeToggle?: { mode: PortalThemeMode; onToggle: () => void };

}) {

  const { user, authFetch, refreshProfile, logout } = useAuth();

  const navigate = useNavigate();

  const { showToast } = useToast();

  const [menuOpen, setMenuOpen] = useState(false);

  const [cropFile, setCropFile] = useState<File | null>(null);

  const [passwordOpen, setPasswordOpen] = useState(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);

  const [photoBusy, setPhotoBusy] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);



  const isAdmin = user?.type === "ADMIN";

  const portalTheme = useOptionalPortalTheme();

  const resolvedThemeToggle =
    themeToggle ?? (!isAdmin && portalTheme ? { mode: portalTheme.mode, onToggle: portalTheme.toggleMode } : undefined);

  const avatarSize = topbarAvatarSize(className);

  const avatarBlob = useAvatarBlob(user?.avatarUrl, authFetch);

  const hasPhoto = Boolean(user?.avatarUrl && avatarBlob);



  async function handleSignOut() {

    setMenuOpen(false);

    await logout();

    void navigate("/login", { replace: true });

  }



  useEffect(() => {

    if (!menuOpen) return;

    function onDocClick(e: MouseEvent) {

      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);

    }

    document.addEventListener("mousedown", onDocClick);

    return () => document.removeEventListener("mousedown", onDocClick);

  }, [menuOpen]);



  async function uploadPrepared(file: File) {

    const body = new FormData();

    body.append("file", file);

    const res = await authFetch("/api/auth/me/avatar", { method: "POST", body });

    if (!res.ok) {

      const payload = (await res.json().catch(() => null)) as { message?: string | string[] } | null;

      const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;

      throw new Error(message || "Upload failed");

    }

    await refreshProfile();

    showToast("Profile photo updated");

    setCropFile(null);

    setMenuOpen(false);

  }



  function onPhotoPicked(file: File) {

    setCropFile(file);

    setMenuOpen(false);

  }



  async function removePhoto() {

    setPhotoBusy(true);

    try {

      const res = await authFetch("/api/auth/me/avatar", { method: "DELETE" });

      if (!res.ok) {

        const payload = (await res.json().catch(() => null)) as { message?: string | string[] } | null;

        const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;

        throw new Error(message || "Could not remove photo");

      }

      await refreshProfile();

      showToast("Profile photo removed");

      setLightboxOpen(false);

      setMenuOpen(false);

    } catch (err) {

      showToast(err instanceof Error ? err.message : "Could not remove photo", "error");

    } finally {

      setPhotoBusy(false);

    }

  }



  return (

    <>

      <div className="profile-menu-wrap" ref={menuRef}>

        <button

          type="button"

          className="profile-menu-trigger"

          aria-label="Profile menu"

          aria-expanded={menuOpen}

          onClick={() => setMenuOpen((o) => !o)}

        >

          <CurrentUserAvatar size={avatarSize} className={className} />

        </button>

        {menuOpen ? (

          <div className="profile-menu-dropdown profile-menu-dropdown--stacked" role="menu">

            <div className="profile-menu-hero">

              <button

                type="button"

                className="profile-menu-avatar-btn"

                disabled={!hasPhoto}

                aria-label={hasPhoto ? "View profile photo" : "No profile photo"}

                onClick={() => {

                  if (!hasPhoto) return;

                  setMenuOpen(false);

                  setLightboxOpen(true);

                }}

              >

                <CurrentUserAvatar size="xl" className="profile-menu-avatar" />

              </button>

              <p className="profile-menu-user">{user?.fullName ?? "User"}</p>

            </div>

            <div className="profile-menu-actions">

              <ProfilePhotoNativeInputs onFile={onPhotoPicked} disabled={photoBusy}>

                {({ galleryId, cameraId }) => (

                  <>

                    <label htmlFor={galleryId} className="profile-menu-item profile-menu-item--pick" role="menuitem">

                      <Image size={18} aria-hidden />

                      Photo library

                    </label>

                    <label htmlFor={cameraId} className="profile-menu-item profile-menu-item--pick" role="menuitem">

                      <Camera size={18} aria-hidden />

                      Take photo

                    </label>

                  </>

                )}

              </ProfilePhotoNativeInputs>

              {hasPhoto ? (

                <button

                  type="button"

                  className="profile-menu-item profile-menu-item--danger"

                  role="menuitem"

                  disabled={photoBusy}

                  onClick={() => void removePhoto()}

                >

                  <Trash2 size={18} aria-hidden />

                  Remove photo

                </button>

              ) : null}

              <button type="button" className="profile-menu-item" role="menuitem" onClick={() => { setPasswordOpen(true); setMenuOpen(false); }}>

                <KeyRound size={18} aria-hidden />

                Change password

              </button>

              {resolvedThemeToggle ? (

                <button

                  type="button"

                  className="profile-menu-item"

                  role="menuitem"

                  onClick={() => {

                    resolvedThemeToggle.onToggle();

                    setMenuOpen(false);

                  }}

                >

                  {resolvedThemeToggle.mode === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}

                  {resolvedThemeToggle.mode === "dark" ? "Light mode" : "Dark mode"}

                </button>

              ) : null}

              {!isAdmin ? (

                <button type="button" className="profile-menu-item" role="menuitem" onClick={() => void handleSignOut()}>

                  <LogOut size={18} aria-hidden />

                  Sign out

                </button>

              ) : null}

              {isAdmin ? (

                <button

                  type="button"

                  className="profile-menu-item"

                  role="menuitem"

                  onClick={() => {

                    setMenuOpen(false);

                    navigate("/database");

                  }}

                >

                  <Database size={18} aria-hidden />

                  Database portal

                </button>

              ) : null}

            </div>

          </div>

        ) : null}

      </div>



      {cropFile ? (

        <ProfilePhotoCropDialog

          file={cropFile}

          onClose={() => setCropFile(null)}

          onSave={async (prepared) => {

            setPhotoBusy(true);

            try {

              await uploadPrepared(prepared);

            } catch (err) {

              showToast(err instanceof Error ? err.message : "Upload failed", "error");

              throw err;

            } finally {

              setPhotoBusy(false);

            }

          }}

        />

      ) : null}



      {lightboxOpen && avatarBlob ? <ProfilePhotoLightbox src={avatarBlob} onClose={() => setLightboxOpen(false)} /> : null}



      {passwordOpen ? <ChangePasswordDialog onClose={() => setPasswordOpen(false)} /> : null}

    </>

  );

}


