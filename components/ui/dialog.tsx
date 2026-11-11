"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[90] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

type DialogContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  /**
   * Full-bleed sheet on phones, the normal centred card from `sm` up.
   *
   * Passed as a PROP rather than extra classes: the elements below carry a base
   * `max-w-lg` / `max-h-[90vh]`, and a caller-supplied `max-w-[calc(100vw-1rem)]`
   * loses or wins against it by stylesheet order — which is how the scoring
   * dialogs stayed desktop-width on a phone.
   */
  fullOnMobile?: boolean;
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, fullOnMobile, ...props }, ref) => {
  // Safety net: while a dialog is open Radix locks the page by setting
  // `pointer-events: none` (plus a scroll lock) on <body>. If a dialog unmounts
  // WITHOUT going through its normal close — e.g. the app navigates away
  // immediately after a successful delete — that inline lock can be left
  // behind, and then the whole app is frozen (nothing is clickable) until a
  // manual page reload. Releasing the lock on unmount prevents that.
  React.useEffect(() => {
    return () => {
      if (typeof document === "undefined") return;
      document.body.style.pointerEvents = "";
      // The scroll lock is the other half of the freeze: with
      // `data-scroll-locked` left on <body>, the page cannot scroll either.
      document.body.style.overflow = "";
      document.body.removeAttribute("data-scroll-locked");
    };
  }, []);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Shared animation/state classes.
          "z-[90] grid gap-4 bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          fullOnMobile
            ? // Phone: the whole viewport, no rounding, no side gutters. Desktop:
              // the familiar centred card (max-width comes from `className`).
              // `fixed` is NOT optional: without it the content renders in normal
              // flow inside the portal, i.e. invisible behind the overlay — which
              // looked exactly like "the dialog does not open".
              "fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-y-auto overflow-x-hidden overscroll-contain rounded-none border-0 p-4 [&>*]:min-w-0 sm:inset-auto sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border sm:p-6"
            : "fixed left-[50%] top-[50%] w-full max-w-lg max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-none border p-6 sm:rounded-lg",
          className
        )}
        {...props}
      >
        {children}
        {/* 36px target: the bare 16px icon was a miss on touch (every dialog
            inherits this, so the fix lives here, not per caller). */}
        <DialogPrimitive.Close className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:bg-gray-100 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
