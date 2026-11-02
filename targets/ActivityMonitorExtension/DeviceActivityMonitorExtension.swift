//
//  DeviceActivityMonitorExtension.swift
//  ActivityMonitorExtension
//
//  Created by Robert Herber on 2023-07-05.
//

import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings
import NotificationCenter
import os

class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  // Device Activity callbacks can arrive only when the device is next used.
  // Don't let yesterday's delayed start re-shield in daytime, or a delayed
  // end unshield during tonight's NEW protection interval.
  // A missing legacy setting is nil so an upgraded app retains its existing
  // callbacks until the next successful schedule configuration.
  private func isWithinConfiguredCurfyWindow() -> Bool? {
    guard
      let window = userDefaults?.dictionary(forKey: "curfy-bedtime-clock-window"),
      let start = (window["startMinute"] as? NSNumber)?.intValue,
      let end = (window["endMinute"] as? NSNumber)?.intValue,
      (0..<1440).contains(start), (0..<1440).contains(end), start != end
    else { return nil }

    let components = Calendar.current.dateComponents([.hour, .minute], from: Date())
    guard let hour = components.hour, let minute = components.minute else { return nil }
    let current = hour * 60 + minute
    if start < end {
      return current >= start && current < end
    }
    return current >= start || current < end
  }

  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)
    logger.log("intervalDidStart")

    // An interval-start callback can arrive late when iOS resumes device
    // activity. A genuine 120-second exception must not be cancelled by the
    // daily bedtime monitor's delayed start callback. The separate one-shot
    // exception monitor remains responsible for restoring the shield.
    let nowMs = Date().timeIntervalSince1970 * 1000
    let exception = userDefaults?.dictionary(forKey: "curfy-active-exception")
    let exceptionExpiry = (exception?["expiresAt"] as? NSNumber)?.doubleValue ?? 0
    let bedtimeEnd = (exception?["bedtimeEndAt"] as? NSNumber)?.doubleValue ?? 0
    let exceptionStillActive = nowMs < exceptionExpiry && nowMs < bedtimeEnd

    if activity.rawValue == "curfy-bedtime" && isWithinConfiguredCurfyWindow() == false {
      logger.log("Ignoring delayed bedtime start outside the current clock window")
    } else if activity.rawValue == "curfy-bedtime" && exceptionStillActive {
      logger.log("Ignoring delayed bedtime start during active Curfy exception")
    } else {
      self.executeActionsForEvent(
        activityName: activity.rawValue,
        callbackName: "intervalDidStart",
        eventName: nil
      )
    }

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalDidStart"
    )

    notifyAppWithName(name: "intervalDidStart")
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    logger.log("intervalDidEnd")

    // Do not let a delayed end from an earlier nightly interval clear
    // tonight's currently active ManagedSettings shield.
    if activity.rawValue == "curfy-bedtime" && isWithinConfiguredCurfyWindow() == true {
      logger.log("Ignoring delayed bedtime end inside the new active clock window")
      return
    }

    // Curfy's 15-minute exception uses its own one-shot monitor.
    // stopMonitoring can also trigger intervalDidEnd; ignored until expiry.
    // Never let a delayed/stale callback re-shield apps after bedtime ends.
    if activity.rawValue.hasPrefix("curfy-exception-") {
      guard
        let state = userDefaults?.dictionary(forKey: "curfy-active-exception"),
        let currentName = state["activityName"] as? String,
        let expiryMs = (state["expiresAt"] as? NSNumber)?.doubleValue,
        let bedtimeEndMs = (state["bedtimeEndAt"] as? NSNumber)?.doubleValue,
        currentName == activity.rawValue
      else {
        logger.log("Ignoring missing/stale Curfy exception callback")
        return
      }
      let nowMs = Date().timeIntervalSince1970 * 1000
      guard nowMs >= expiryMs && nowMs < bedtimeEndMs else {
        logger.log("Ignoring Curfy exception end outside active bedtime restriction")
        return
      }
    }

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalDidEnd",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalDidEnd"
    )

    notifyAppWithName(name: "intervalDidEnd")
  }

  func executeActionsForEvent(
    activityName: String,
    callbackName: String,
    eventName: String?
  ) {
    let triggeredBy =
      eventName != nil
      ? "actions_for_\(activityName)_\(callbackName)_\(eventName!)"
      : "actions_for_\(activityName)_\(callbackName)"

    let placeholders = [
      "activityName": activityName,
      "callbackName": callbackName,
      "eventName": eventName
    ]

    let originalWhitelist = getCurrentWhitelist()
    let originalBlocklist = getCurrentBlocklist()

    CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)

    if let actions = userDefaults?.array(forKey: triggeredBy) {
      actions.forEach { actionRaw in
        if let action = actionRaw as? [String: Any] {
          let skipIfAlreadyTriggeredAfter = action["skipIfAlreadyTriggeredAfter"] as? Double
          let skipIfLargerEventRecordedAfter = action["skipIfLargerEventRecordedAfter"] as? Double
          let skipIfAlreadyTriggeredWithinMS = action["skipIfAlreadyTriggeredWithinMS"] as? Double
          let skipIfLargerEventRecordedWithinMS =
            action["skipIfLargerEventRecordedWithinMS"] as? Double
          let skipIfLargerEventRecordedSinceIntervalStarted =
            action["skipIfLargerEventRecordedSinceIntervalStarted"] as? Bool
          let neverTriggerBefore = action["neverTriggerBefore"] as? Double
          let skipIfAlreadyTriggeredBefore = action["skipIfAlreadyTriggeredBefore"] as? Double

          let skipIfAlreadyTriggeredBetweenFromDate =
            action["skipIfAlreadyTriggeredBetweenFromDate"] as? Double
          let skipIfAlreadyTriggeredBetweenToDate =
            action["skipIfAlreadyTriggeredBetweenToDate"] as? Double

          let skipIfWhitelistOrBlacklistIsUnchanged =
            action["skipIfWhitelistOrBlacklistIsUnchanged"] as? Bool

          if shouldExecuteAction(
            skipIfAlreadyTriggeredAfter: skipIfAlreadyTriggeredAfter,
            skipIfLargerEventRecordedAfter: skipIfLargerEventRecordedAfter,
            skipIfAlreadyTriggeredWithinMS: skipIfAlreadyTriggeredWithinMS,
            skipIfLargerEventRecordedWithinMS: skipIfLargerEventRecordedWithinMS,
            neverTriggerBefore: neverTriggerBefore,
            skipIfLargerEventRecordedSinceIntervalStarted:
              skipIfLargerEventRecordedSinceIntervalStarted,
            skipIfAlreadyTriggeredBefore: skipIfAlreadyTriggeredBefore,
            skipIfAlreadyTriggeredBetweenFromDate: skipIfAlreadyTriggeredBetweenFromDate,
            skipIfAlreadyTriggeredBetweenToDate: skipIfAlreadyTriggeredBetweenToDate,
            skipIfWhitelistOrBlacklistIsUnchanged: skipIfWhitelistOrBlacklistIsUnchanged,
            originalWhitelist: originalWhitelist,
            originalBlocklist: originalBlocklist,
            activityName: activityName,
            callbackName: callbackName,
            eventName: eventName
          ) {
            executeGenericAction(
              action: action,
              placeholders: placeholders,
              triggeredBy: triggeredBy
            )
          }
        }
      }
    }
  }

  override func eventDidReachThreshold(
    _ event: DeviceActivityEvent.Name, activity: DeviceActivityName
  ) {
    super.eventDidReachThreshold(event, activity: activity)
    logger.log("eventDidReachThreshold: \(event.rawValue, privacy: .public)")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "eventDidReachThreshold",
      eventName: event.rawValue
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "eventDidReachThreshold",
      eventName: event.rawValue
    )

    notifyAppWithName(name: "eventDidReachThreshold")
  }

  override func intervalWillStartWarning(for activity: DeviceActivityName) {
    super.intervalWillStartWarning(for: activity)
    logger.log("intervalWillStartWarning")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalWillStartWarning",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalWillStartWarning"
    )

    notifyAppWithName(name: "intervalWillStartWarning")
  }

  override func intervalWillEndWarning(for activity: DeviceActivityName) {
    super.intervalWillEndWarning(for: activity)
    logger.log("intervalWillEndWarning")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalWillEndWarning",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalWillEndWarning"
    )

    notifyAppWithName(name: "intervalWillEndWarning")
  }

  override func eventWillReachThresholdWarning(
    _ event: DeviceActivityEvent.Name, activity: DeviceActivityName
  ) {
    super.eventWillReachThresholdWarning(event, activity: activity)
    logger.log("eventWillReachThresholdWarning: \(event.rawValue, privacy: .public)")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "eventWillReachThresholdWarning",
      eventName: event.rawValue
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "eventWillReachThresholdWarning",
      eventName: event.rawValue
    )

    notifyAppWithName(name: "eventWillReachThresholdWarning")
  }

}
