/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 532.0, "minX": 0.0, "maxY": 23349.0, "series": [{"data": [[0.0, 532.0], [0.1, 631.0], [0.2, 693.0], [0.3, 741.0], [0.4, 792.0], [0.5, 812.0], [0.6, 854.0], [0.7, 937.0], [0.8, 988.0], [0.9, 1012.0], [1.0, 1026.0], [1.1, 1040.0], [1.2, 1065.0], [1.3, 1088.0], [1.4, 1168.0], [1.5, 1200.0], [1.6, 1291.0], [1.7, 1336.0], [1.8, 1393.0], [1.9, 1910.0], [2.0, 1936.0], [2.1, 1986.0], [2.2, 2012.0], [2.3, 2081.0], [2.4, 2229.0], [2.5, 2301.0], [2.6, 2454.0], [2.7, 2536.0], [2.8, 2626.0], [2.9, 2647.0], [3.0, 2706.0], [3.1, 2749.0], [3.2, 2769.0], [3.3, 2789.0], [3.4, 2833.0], [3.5, 2914.0], [3.6, 2965.0], [3.7, 2981.0], [3.8, 3018.0], [3.9, 3044.0], [4.0, 3063.0], [4.1, 3145.0], [4.2, 3239.0], [4.3, 3267.0], [4.4, 3285.0], [4.5, 3320.0], [4.6, 3383.0], [4.7, 3405.0], [4.8, 3420.0], [4.9, 3445.0], [5.0, 3479.0], [5.1, 3499.0], [5.2, 3522.0], [5.3, 3539.0], [5.4, 3547.0], [5.5, 3583.0], [5.6, 3594.0], [5.7, 3631.0], [5.8, 3648.0], [5.9, 3677.0], [6.0, 3691.0], [6.1, 3723.0], [6.2, 3734.0], [6.3, 3756.0], [6.4, 3770.0], [6.5, 3773.0], [6.6, 3777.0], [6.7, 3782.0], [6.8, 3822.0], [6.9, 3825.0], [7.0, 3846.0], [7.1, 3869.0], [7.2, 3909.0], [7.3, 3927.0], [7.4, 3937.0], [7.5, 3946.0], [7.6, 3961.0], [7.7, 3987.0], [7.8, 3997.0], [7.9, 4022.0], [8.0, 4041.0], [8.1, 4061.0], [8.2, 4072.0], [8.3, 4092.0], [8.4, 4108.0], [8.5, 4120.0], [8.6, 4124.0], [8.7, 4132.0], [8.8, 4142.0], [8.9, 4175.0], [9.0, 4191.0], [9.1, 4207.0], [9.2, 4223.0], [9.3, 4228.0], [9.4, 4240.0], [9.5, 4252.0], [9.6, 4256.0], [9.7, 4266.0], [9.8, 4276.0], [9.9, 4300.0], [10.0, 4315.0], [10.1, 4357.0], [10.2, 4398.0], [10.3, 4414.0], [10.4, 4430.0], [10.5, 4435.0], [10.6, 4452.0], [10.7, 4467.0], [10.8, 4497.0], [10.9, 4521.0], [11.0, 4538.0], [11.1, 4555.0], [11.2, 4589.0], [11.3, 4620.0], [11.4, 4630.0], [11.5, 4640.0], [11.6, 4653.0], [11.7, 4673.0], [11.8, 4684.0], [11.9, 4704.0], [12.0, 4745.0], [12.1, 4782.0], [12.2, 4788.0], [12.3, 4807.0], [12.4, 4831.0], [12.5, 4855.0], [12.6, 4870.0], [12.7, 4893.0], [12.8, 4911.0], [12.9, 4921.0], [13.0, 4939.0], [13.1, 4966.0], [13.2, 4973.0], [13.3, 4995.0], [13.4, 5006.0], [13.5, 5025.0], [13.6, 5029.0], [13.7, 5044.0], [13.8, 5049.0], [13.9, 5058.0], [14.0, 5093.0], [14.1, 5097.0], [14.2, 5109.0], [14.3, 5118.0], [14.4, 5125.0], [14.5, 5133.0], [14.6, 5141.0], [14.7, 5162.0], [14.8, 5172.0], [14.9, 5181.0], [15.0, 5185.0], [15.1, 5189.0], [15.2, 5198.0], [15.3, 5218.0], [15.4, 5228.0], [15.5, 5244.0], [15.6, 5254.0], [15.7, 5280.0], [15.8, 5295.0], [15.9, 5322.0], [16.0, 5328.0], [16.1, 5344.0], [16.2, 5353.0], [16.3, 5370.0], [16.4, 5376.0], [16.5, 5390.0], [16.6, 5411.0], [16.7, 5437.0], [16.8, 5449.0], [16.9, 5450.0], [17.0, 5463.0], [17.1, 5472.0], [17.2, 5480.0], [17.3, 5516.0], [17.4, 5522.0], [17.5, 5549.0], [17.6, 5573.0], [17.7, 5593.0], [17.8, 5605.0], [17.9, 5645.0], [18.0, 5665.0], [18.1, 5681.0], [18.2, 5698.0], [18.3, 5716.0], [18.4, 5742.0], [18.5, 5782.0], [18.6, 5845.0], [18.7, 5895.0], [18.8, 5960.0], [18.9, 5982.0], [19.0, 6007.0], [19.1, 6032.0], [19.2, 6083.0], [19.3, 6179.0], [19.4, 6200.0], [19.5, 6227.0], [19.6, 6254.0], [19.7, 6284.0], [19.8, 6318.0], [19.9, 6360.0], [20.0, 6375.0], [20.1, 6381.0], [20.2, 6389.0], [20.3, 6427.0], [20.4, 6449.0], [20.5, 6464.0], [20.6, 6472.0], [20.7, 6510.0], [20.8, 6530.0], [20.9, 6568.0], [21.0, 6583.0], [21.1, 6599.0], [21.2, 6621.0], [21.3, 6647.0], [21.4, 6680.0], [21.5, 6708.0], [21.6, 6739.0], [21.7, 6749.0], [21.8, 6759.0], [21.9, 6763.0], [22.0, 6784.0], [22.1, 6803.0], [22.2, 6820.0], [22.3, 6839.0], [22.4, 6853.0], [22.5, 6861.0], [22.6, 6900.0], [22.7, 6922.0], [22.8, 6944.0], [22.9, 6966.0], [23.0, 6989.0], [23.1, 7030.0], [23.2, 7079.0], [23.3, 7097.0], [23.4, 7124.0], [23.5, 7153.0], [23.6, 7183.0], [23.7, 7207.0], [23.8, 7233.0], [23.9, 7256.0], [24.0, 7297.0], [24.1, 7318.0], [24.2, 7341.0], [24.3, 7350.0], [24.4, 7386.0], [24.5, 7404.0], [24.6, 7417.0], [24.7, 7429.0], [24.8, 7455.0], [24.9, 7475.0], [25.0, 7517.0], [25.1, 7570.0], [25.2, 7578.0], [25.3, 7594.0], [25.4, 7608.0], [25.5, 7619.0], [25.6, 7639.0], [25.7, 7661.0], [25.8, 7691.0], [25.9, 7729.0], [26.0, 7746.0], [26.1, 7770.0], [26.2, 7793.0], [26.3, 7817.0], [26.4, 7840.0], [26.5, 7870.0], [26.6, 7891.0], [26.7, 7905.0], [26.8, 7922.0], [26.9, 7977.0], [27.0, 8030.0], [27.1, 8042.0], [27.2, 8078.0], [27.3, 8101.0], [27.4, 8110.0], [27.5, 8132.0], [27.6, 8179.0], [27.7, 8192.0], [27.8, 8198.0], [27.9, 8209.0], [28.0, 8240.0], [28.1, 8259.0], [28.2, 8269.0], [28.3, 8273.0], [28.4, 8300.0], [28.5, 8358.0], [28.6, 8381.0], [28.7, 8386.0], [28.8, 8438.0], [28.9, 8477.0], [29.0, 8505.0], [29.1, 8518.0], [29.2, 8564.0], [29.3, 8594.0], [29.4, 8640.0], [29.5, 8656.0], [29.6, 8671.0], [29.7, 8708.0], [29.8, 8713.0], [29.9, 8732.0], [30.0, 8741.0], [30.1, 8755.0], [30.2, 8774.0], [30.3, 8784.0], [30.4, 8797.0], [30.5, 8800.0], [30.6, 8819.0], [30.7, 8828.0], [30.8, 8844.0], [30.9, 8856.0], [31.0, 8889.0], [31.1, 8913.0], [31.2, 8930.0], [31.3, 8941.0], [31.4, 8971.0], [31.5, 9005.0], [31.6, 9018.0], [31.7, 9036.0], [31.8, 9043.0], [31.9, 9052.0], [32.0, 9065.0], [32.1, 9079.0], [32.2, 9100.0], [32.3, 9112.0], [32.4, 9128.0], [32.5, 9144.0], [32.6, 9153.0], [32.7, 9166.0], [32.8, 9175.0], [32.9, 9194.0], [33.0, 9239.0], [33.1, 9247.0], [33.2, 9282.0], [33.3, 9291.0], [33.4, 9306.0], [33.5, 9316.0], [33.6, 9333.0], [33.7, 9339.0], [33.8, 9363.0], [33.9, 9405.0], [34.0, 9424.0], [34.1, 9454.0], [34.2, 9475.0], [34.3, 9485.0], [34.4, 9495.0], [34.5, 9506.0], [34.6, 9522.0], [34.7, 9548.0], [34.8, 9555.0], [34.9, 9566.0], [35.0, 9585.0], [35.1, 9614.0], [35.2, 9678.0], [35.3, 9689.0], [35.4, 9723.0], [35.5, 9736.0], [35.6, 9750.0], [35.7, 9774.0], [35.8, 9792.0], [35.9, 9818.0], [36.0, 9827.0], [36.1, 9838.0], [36.2, 9855.0], [36.3, 9894.0], [36.4, 9898.0], [36.5, 9913.0], [36.6, 9942.0], [36.7, 9993.0], [36.8, 10016.0], [36.9, 10019.0], [37.0, 10038.0], [37.1, 10071.0], [37.2, 10076.0], [37.3, 10081.0], [37.4, 10111.0], [37.5, 10134.0], [37.6, 10169.0], [37.7, 10183.0], [37.8, 10232.0], [37.9, 10253.0], [38.0, 10254.0], [38.1, 10281.0], [38.2, 10293.0], [38.3, 10305.0], [38.4, 10346.0], [38.5, 10382.0], [38.6, 10394.0], [38.7, 10418.0], [38.8, 10446.0], [38.9, 10459.0], [39.0, 10475.0], [39.1, 10480.0], [39.2, 10484.0], [39.3, 10516.0], [39.4, 10564.0], [39.5, 10570.0], [39.6, 10604.0], [39.7, 10618.0], [39.8, 10634.0], [39.9, 10647.0], [40.0, 10668.0], [40.1, 10705.0], [40.2, 10721.0], [40.3, 10735.0], [40.4, 10795.0], [40.5, 10827.0], [40.6, 10850.0], [40.7, 10875.0], [40.8, 10879.0], [40.9, 10888.0], [41.0, 10915.0], [41.1, 10920.0], [41.2, 10944.0], [41.3, 10951.0], [41.4, 10989.0], [41.5, 11017.0], [41.6, 11032.0], [41.7, 11045.0], [41.8, 11064.0], [41.9, 11081.0], [42.0, 11108.0], [42.1, 11146.0], [42.2, 11175.0], [42.3, 11214.0], [42.4, 11261.0], [42.5, 11271.0], [42.6, 11278.0], [42.7, 11293.0], [42.8, 11313.0], [42.9, 11318.0], [43.0, 11325.0], [43.1, 11331.0], [43.2, 11359.0], [43.3, 11369.0], [43.4, 11380.0], [43.5, 11400.0], [43.6, 11420.0], [43.7, 11422.0], [43.8, 11444.0], [43.9, 11453.0], [44.0, 11480.0], [44.1, 11494.0], [44.2, 11512.0], [44.3, 11542.0], [44.4, 11548.0], [44.5, 11596.0], [44.6, 11627.0], [44.7, 11646.0], [44.8, 11660.0], [44.9, 11678.0], [45.0, 11695.0], [45.1, 11704.0], [45.2, 11727.0], [45.3, 11742.0], [45.4, 11757.0], [45.5, 11784.0], [45.6, 11816.0], [45.7, 11858.0], [45.8, 11875.0], [45.9, 11889.0], [46.0, 11901.0], [46.1, 11907.0], [46.2, 11914.0], [46.3, 11934.0], [46.4, 11940.0], [46.5, 11956.0], [46.6, 11980.0], [46.7, 12006.0], [46.8, 12020.0], [46.9, 12033.0], [47.0, 12053.0], [47.1, 12058.0], [47.2, 12070.0], [47.3, 12097.0], [47.4, 12134.0], [47.5, 12141.0], [47.6, 12154.0], [47.7, 12222.0], [47.8, 12251.0], [47.9, 12265.0], [48.0, 12306.0], [48.1, 12368.0], [48.2, 12380.0], [48.3, 12397.0], [48.4, 12450.0], [48.5, 12478.0], [48.6, 12483.0], [48.7, 12527.0], [48.8, 12531.0], [48.9, 12560.0], [49.0, 12622.0], [49.1, 12650.0], [49.2, 12702.0], [49.3, 12729.0], [49.4, 12750.0], [49.5, 12780.0], [49.6, 12808.0], [49.7, 12826.0], [49.8, 12876.0], [49.9, 12893.0], [50.0, 12919.0], [50.1, 12935.0], [50.2, 12963.0], [50.3, 12995.0], [50.4, 13006.0], [50.5, 13041.0], [50.6, 13076.0], [50.7, 13090.0], [50.8, 13108.0], [50.9, 13130.0], [51.0, 13154.0], [51.1, 13173.0], [51.2, 13223.0], [51.3, 13241.0], [51.4, 13259.0], [51.5, 13291.0], [51.6, 13336.0], [51.7, 13344.0], [51.8, 13365.0], [51.9, 13396.0], [52.0, 13410.0], [52.1, 13464.0], [52.2, 13486.0], [52.3, 13490.0], [52.4, 13509.0], [52.5, 13514.0], [52.6, 13521.0], [52.7, 13535.0], [52.8, 13543.0], [52.9, 13556.0], [53.0, 13558.0], [53.1, 13561.0], [53.2, 13568.0], [53.3, 13578.0], [53.4, 13591.0], [53.5, 13616.0], [53.6, 13623.0], [53.7, 13639.0], [53.8, 13649.0], [53.9, 13674.0], [54.0, 13681.0], [54.1, 13693.0], [54.2, 13721.0], [54.3, 13733.0], [54.4, 13749.0], [54.5, 13758.0], [54.6, 13769.0], [54.7, 13790.0], [54.8, 13797.0], [54.9, 13810.0], [55.0, 13829.0], [55.1, 13837.0], [55.2, 13856.0], [55.3, 13874.0], [55.4, 13889.0], [55.5, 13899.0], [55.6, 13904.0], [55.7, 13910.0], [55.8, 13924.0], [55.9, 13934.0], [56.0, 13947.0], [56.1, 13956.0], [56.2, 13968.0], [56.3, 13975.0], [56.4, 13987.0], [56.5, 14004.0], [56.6, 14017.0], [56.7, 14027.0], [56.8, 14059.0], [56.9, 14082.0], [57.0, 14098.0], [57.1, 14121.0], [57.2, 14132.0], [57.3, 14139.0], [57.4, 14173.0], [57.5, 14187.0], [57.6, 14205.0], [57.7, 14215.0], [57.8, 14231.0], [57.9, 14254.0], [58.0, 14279.0], [58.1, 14285.0], [58.2, 14297.0], [58.3, 14315.0], [58.4, 14332.0], [58.5, 14357.0], [58.6, 14373.0], [58.7, 14376.0], [58.8, 14382.0], [58.9, 14390.0], [59.0, 14408.0], [59.1, 14423.0], [59.2, 14436.0], [59.3, 14453.0], [59.4, 14468.0], [59.5, 14499.0], [59.6, 14505.0], [59.7, 14528.0], [59.8, 14541.0], [59.9, 14566.0], [60.0, 14580.0], [60.1, 14595.0], [60.2, 14603.0], [60.3, 14609.0], [60.4, 14612.0], [60.5, 14622.0], [60.6, 14631.0], [60.7, 14640.0], [60.8, 14647.0], [60.9, 14661.0], [61.0, 14674.0], [61.1, 14700.0], [61.2, 14719.0], [61.3, 14736.0], [61.4, 14757.0], [61.5, 14765.0], [61.6, 14771.0], [61.7, 14809.0], [61.8, 14814.0], [61.9, 14834.0], [62.0, 14862.0], [62.1, 14881.0], [62.2, 14901.0], [62.3, 14913.0], [62.4, 14929.0], [62.5, 14956.0], [62.6, 14965.0], [62.7, 14981.0], [62.8, 14993.0], [62.9, 15010.0], [63.0, 15035.0], [63.1, 15040.0], [63.2, 15057.0], [63.3, 15077.0], [63.4, 15116.0], [63.5, 15121.0], [63.6, 15134.0], [63.7, 15139.0], [63.8, 15144.0], [63.9, 15162.0], [64.0, 15179.0], [64.1, 15205.0], [64.2, 15218.0], [64.3, 15234.0], [64.4, 15254.0], [64.5, 15276.0], [64.6, 15282.0], [64.7, 15293.0], [64.8, 15314.0], [64.9, 15333.0], [65.0, 15359.0], [65.1, 15375.0], [65.2, 15394.0], [65.3, 15402.0], [65.4, 15411.0], [65.5, 15425.0], [65.6, 15438.0], [65.7, 15475.0], [65.8, 15522.0], [65.9, 15549.0], [66.0, 15573.0], [66.1, 15613.0], [66.2, 15625.0], [66.3, 15657.0], [66.4, 15667.0], [66.5, 15685.0], [66.6, 15713.0], [66.7, 15734.0], [66.8, 15755.0], [66.9, 15788.0], [67.0, 15796.0], [67.1, 15831.0], [67.2, 15845.0], [67.3, 15881.0], [67.4, 15915.0], [67.5, 15948.0], [67.6, 16011.0], [67.7, 16029.0], [67.8, 16074.0], [67.9, 16112.0], [68.0, 16142.0], [68.1, 16187.0], [68.2, 16231.0], [68.3, 16253.0], [68.4, 16266.0], [68.5, 16281.0], [68.6, 16294.0], [68.7, 16331.0], [68.8, 16350.0], [68.9, 16361.0], [69.0, 16387.0], [69.1, 16396.0], [69.2, 16406.0], [69.3, 16440.0], [69.4, 16465.0], [69.5, 16489.0], [69.6, 16510.0], [69.7, 16522.0], [69.8, 16527.0], [69.9, 16561.0], [70.0, 16565.0], [70.1, 16577.0], [70.2, 16610.0], [70.3, 16629.0], [70.4, 16645.0], [70.5, 16670.0], [70.6, 16687.0], [70.7, 16695.0], [70.8, 16736.0], [70.9, 16759.0], [71.0, 16802.0], [71.1, 16812.0], [71.2, 16829.0], [71.3, 16857.0], [71.4, 16902.0], [71.5, 16922.0], [71.6, 16948.0], [71.7, 16996.0], [71.8, 17023.0], [71.9, 17041.0], [72.0, 17045.0], [72.1, 17085.0], [72.2, 17089.0], [72.3, 17097.0], [72.4, 17110.0], [72.5, 17140.0], [72.6, 17149.0], [72.7, 17158.0], [72.8, 17170.0], [72.9, 17183.0], [73.0, 17198.0], [73.1, 17225.0], [73.2, 17243.0], [73.3, 17269.0], [73.4, 17288.0], [73.5, 17299.0], [73.6, 17320.0], [73.7, 17332.0], [73.8, 17337.0], [73.9, 17364.0], [74.0, 17380.0], [74.1, 17382.0], [74.2, 17401.0], [74.3, 17419.0], [74.4, 17437.0], [74.5, 17455.0], [74.6, 17465.0], [74.7, 17523.0], [74.8, 17541.0], [74.9, 17577.0], [75.0, 17626.0], [75.1, 17658.0], [75.2, 17682.0], [75.3, 17708.0], [75.4, 17746.0], [75.5, 17768.0], [75.6, 17832.0], [75.7, 17866.0], [75.8, 17875.0], [75.9, 17882.0], [76.0, 17902.0], [76.1, 17937.0], [76.2, 17963.0], [76.3, 17975.0], [76.4, 17990.0], [76.5, 18018.0], [76.6, 18040.0], [76.7, 18051.0], [76.8, 18074.0], [76.9, 18076.0], [77.0, 18094.0], [77.1, 18122.0], [77.2, 18137.0], [77.3, 18157.0], [77.4, 18194.0], [77.5, 18222.0], [77.6, 18233.0], [77.7, 18251.0], [77.8, 18292.0], [77.9, 18321.0], [78.0, 18336.0], [78.1, 18349.0], [78.2, 18355.0], [78.3, 18372.0], [78.4, 18390.0], [78.5, 18432.0], [78.6, 18470.0], [78.7, 18491.0], [78.8, 18515.0], [78.9, 18527.0], [79.0, 18554.0], [79.1, 18581.0], [79.2, 18597.0], [79.3, 18618.0], [79.4, 18646.0], [79.5, 18655.0], [79.6, 18688.0], [79.7, 18718.0], [79.8, 18735.0], [79.9, 18778.0], [80.0, 18814.0], [80.1, 18862.0], [80.2, 18873.0], [80.3, 18879.0], [80.4, 18903.0], [80.5, 18912.0], [80.6, 18915.0], [80.7, 18935.0], [80.8, 18959.0], [80.9, 18982.0], [81.0, 19000.0], [81.1, 19014.0], [81.2, 19032.0], [81.3, 19040.0], [81.4, 19070.0], [81.5, 19102.0], [81.6, 19144.0], [81.7, 19160.0], [81.8, 19169.0], [81.9, 19185.0], [82.0, 19230.0], [82.1, 19296.0], [82.2, 19317.0], [82.3, 19325.0], [82.4, 19356.0], [82.5, 19368.0], [82.6, 19384.0], [82.7, 19406.0], [82.8, 19420.0], [82.9, 19423.0], [83.0, 19442.0], [83.1, 19465.0], [83.2, 19487.0], [83.3, 19507.0], [83.4, 19516.0], [83.5, 19531.0], [83.6, 19543.0], [83.7, 19590.0], [83.8, 19642.0], [83.9, 19666.0], [84.0, 19688.0], [84.1, 19702.0], [84.2, 19726.0], [84.3, 19732.0], [84.4, 19740.0], [84.5, 19762.0], [84.6, 19782.0], [84.7, 19793.0], [84.8, 19798.0], [84.9, 19823.0], [85.0, 19839.0], [85.1, 19853.0], [85.2, 19901.0], [85.3, 19951.0], [85.4, 19961.0], [85.5, 19973.0], [85.6, 19989.0], [85.7, 19994.0], [85.8, 20010.0], [85.9, 20033.0], [86.0, 20067.0], [86.1, 20091.0], [86.2, 20099.0], [86.3, 20113.0], [86.4, 20126.0], [86.5, 20145.0], [86.6, 20167.0], [86.7, 20169.0], [86.8, 20185.0], [86.9, 20196.0], [87.0, 20203.0], [87.1, 20208.0], [87.2, 20228.0], [87.3, 20239.0], [87.4, 20248.0], [87.5, 20260.0], [87.6, 20280.0], [87.7, 20284.0], [87.8, 20307.0], [87.9, 20342.0], [88.0, 20351.0], [88.1, 20360.0], [88.2, 20376.0], [88.3, 20379.0], [88.4, 20402.0], [88.5, 20406.0], [88.6, 20408.0], [88.7, 20411.0], [88.8, 20418.0], [88.9, 20424.0], [89.0, 20431.0], [89.1, 20439.0], [89.2, 20453.0], [89.3, 20460.0], [89.4, 20463.0], [89.5, 20469.0], [89.6, 20471.0], [89.7, 20478.0], [89.8, 20490.0], [89.9, 20492.0], [90.0, 20504.0], [90.1, 20509.0], [90.2, 20514.0], [90.3, 20517.0], [90.4, 20525.0], [90.5, 20533.0], [90.6, 20542.0], [90.7, 20549.0], [90.8, 20553.0], [90.9, 20558.0], [91.0, 20566.0], [91.1, 20575.0], [91.2, 20580.0], [91.3, 20582.0], [91.4, 20589.0], [91.5, 20600.0], [91.6, 20611.0], [91.7, 20614.0], [91.8, 20621.0], [91.9, 20628.0], [92.0, 20639.0], [92.1, 20645.0], [92.2, 20647.0], [92.3, 20659.0], [92.4, 20665.0], [92.5, 20666.0], [92.6, 20670.0], [92.7, 20676.0], [92.8, 20678.0], [92.9, 20684.0], [93.0, 20688.0], [93.1, 20701.0], [93.2, 20708.0], [93.3, 20714.0], [93.4, 20718.0], [93.5, 20725.0], [93.6, 20729.0], [93.7, 20739.0], [93.8, 20749.0], [93.9, 20758.0], [94.0, 20774.0], [94.1, 20778.0], [94.2, 20789.0], [94.3, 20797.0], [94.4, 20802.0], [94.5, 20813.0], [94.6, 20833.0], [94.7, 20835.0], [94.8, 20860.0], [94.9, 20872.0], [95.0, 20879.0], [95.1, 20897.0], [95.2, 20915.0], [95.3, 20932.0], [95.4, 20948.0], [95.5, 20980.0], [95.6, 20992.0], [95.7, 21005.0], [95.8, 21021.0], [95.9, 21025.0], [96.0, 21036.0], [96.1, 21044.0], [96.2, 21065.0], [96.3, 21076.0], [96.4, 21103.0], [96.5, 21113.0], [96.6, 21120.0], [96.7, 21124.0], [96.8, 21143.0], [96.9, 21150.0], [97.0, 21171.0], [97.1, 21188.0], [97.2, 21201.0], [97.3, 21205.0], [97.4, 21239.0], [97.5, 21243.0], [97.6, 21263.0], [97.7, 21281.0], [97.8, 21291.0], [97.9, 21326.0], [98.0, 21331.0], [98.1, 21351.0], [98.2, 21368.0], [98.3, 21383.0], [98.4, 21407.0], [98.5, 21430.0], [98.6, 21453.0], [98.7, 21472.0], [98.8, 21523.0], [98.9, 21543.0], [99.0, 21568.0], [99.1, 21573.0], [99.2, 21585.0], [99.3, 21621.0], [99.4, 21637.0], [99.5, 21720.0], [99.6, 21811.0], [99.7, 22256.0], [99.8, 22434.0], [99.9, 22725.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 500.0, "maxY": 49.0, "series": [{"data": [[500.0, 2.0], [600.0, 5.0], [700.0, 8.0], [800.0, 5.0], [900.0, 6.0], [1000.0, 13.0], [1100.0, 5.0], [1200.0, 4.0], [1300.0, 6.0], [1400.0, 2.0], [1900.0, 9.0], [2000.0, 4.0], [2100.0, 2.0], [2200.0, 3.0], [2300.0, 2.0], [2400.0, 3.0], [2500.0, 5.0], [2600.0, 6.0], [2700.0, 11.0], [2800.0, 4.0], [2900.0, 8.0], [3000.0, 9.0], [3100.0, 3.0], [3300.0, 7.0], [3200.0, 8.0], [3400.0, 15.0], [3500.0, 14.0], [3700.0, 20.0], [3600.0, 13.0], [3800.0, 14.0], [3900.0, 19.0], [4000.0, 16.0], [4200.0, 26.0], [4300.0, 10.0], [4100.0, 20.0], [4500.0, 13.0], [4400.0, 18.0], [4600.0, 18.0], [4700.0, 12.0], [4800.0, 14.0], [4900.0, 19.0], [5100.0, 34.0], [5000.0, 23.0], [5200.0, 17.0], [5300.0, 22.0], [5400.0, 21.0], [5600.0, 14.0], [5500.0, 14.0], [5800.0, 5.0], [5700.0, 10.0], [5900.0, 8.0], [6000.0, 7.0], [6100.0, 5.0], [6300.0, 13.0], [6200.0, 12.0], [6400.0, 14.0], [6500.0, 13.0], [6600.0, 11.0], [6800.0, 15.0], [6700.0, 18.0], [6900.0, 14.0], [7000.0, 9.0], [7100.0, 10.0], [7200.0, 10.0], [7400.0, 14.0], [7300.0, 14.0], [7500.0, 11.0], [7600.0, 15.0], [7700.0, 12.0], [7800.0, 12.0], [7900.0, 10.0], [8000.0, 10.0], [8100.0, 17.0], [8200.0, 16.0], [8300.0, 10.0], [8500.0, 11.0], [8700.0, 23.0], [8600.0, 11.0], [8400.0, 7.0], [8900.0, 13.0], [8800.0, 18.0], [9100.0, 22.0], [9000.0, 21.0], [9200.0, 13.0], [9400.0, 16.0], [9300.0, 16.0], [9500.0, 19.0], [9600.0, 8.0], [9700.0, 15.0], [9800.0, 18.0], [10100.0, 11.0], [10000.0, 19.0], [10200.0, 16.0], [9900.0, 10.0], [10300.0, 10.0], [10400.0, 19.0], [10600.0, 15.0], [10500.0, 9.0], [10700.0, 11.0], [10800.0, 17.0], [11000.0, 15.0], [10900.0, 14.0], [11200.0, 16.0], [11100.0, 8.0], [11400.0, 21.0], [11300.0, 22.0], [11500.0, 10.0], [11600.0, 16.0], [11700.0, 15.0], [11800.0, 12.0], [12000.0, 20.0], [11900.0, 22.0], [12100.0, 11.0], [12200.0, 9.0], [12600.0, 7.0], [12700.0, 12.0], [12300.0, 10.0], [12400.0, 9.0], [12500.0, 10.0], [12900.0, 11.0], [13000.0, 13.0], [12800.0, 12.0], [13100.0, 11.0], [13200.0, 11.0], [13300.0, 13.0], [13500.0, 32.0], [13800.0, 21.0], [13600.0, 21.0], [13700.0, 21.0], [13400.0, 12.0], [14000.0, 18.0], [13900.0, 28.0], [14200.0, 19.0], [14100.0, 16.0], [14300.0, 22.0], [14800.0, 16.0], [14500.0, 19.0], [14400.0, 17.0], [14600.0, 28.0], [14700.0, 17.0], [14900.0, 19.0], [15100.0, 22.0], [15200.0, 20.0], [15300.0, 15.0], [15000.0, 16.0], [15600.0, 14.0], [15800.0, 9.0], [15400.0, 14.0], [15500.0, 11.0], [15700.0, 14.0], [15900.0, 8.0], [16100.0, 8.0], [16200.0, 15.0], [16000.0, 8.0], [16300.0, 15.0], [17200.0, 15.0], [16400.0, 12.0], [16600.0, 16.0], [17000.0, 19.0], [16800.0, 12.0], [17400.0, 14.0], [18200.0, 12.0], [17600.0, 9.0], [17800.0, 12.0], [18000.0, 18.0], [18400.0, 11.0], [18600.0, 13.0], [18800.0, 12.0], [19000.0, 15.0], [19200.0, 6.0], [19400.0, 17.0], [19800.0, 10.0], [19600.0, 11.0], [20000.0, 15.0], [20200.0, 23.0], [20400.0, 47.0], [20600.0, 49.0], [20800.0, 25.0], [21000.0, 21.0], [21200.0, 19.0], [21400.0, 12.0], [22400.0, 2.0], [21600.0, 8.0], [22200.0, 1.0], [22000.0, 1.0], [21800.0, 1.0], [22600.0, 2.0], [22800.0, 1.0], [16500.0, 20.0], [16900.0, 10.0], [16700.0, 8.0], [17300.0, 20.0], [17100.0, 20.0], [17500.0, 9.0], [17700.0, 10.0], [17900.0, 13.0], [18100.0, 12.0], [18300.0, 18.0], [18700.0, 10.0], [18900.0, 18.0], [18500.0, 13.0], [19100.0, 13.0], [19300.0, 17.0], [19500.0, 14.0], [19700.0, 23.0], [19900.0, 16.0], [20100.0, 23.0], [20300.0, 18.0], [20700.0, 38.0], [20500.0, 46.0], [20900.0, 15.0], [21300.0, 16.0], [21500.0, 14.0], [21100.0, 24.0], [21900.0, 1.0], [22300.0, 1.0], [21700.0, 3.0], [22700.0, 1.0], [23300.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 23300.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 56.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2944.0, "series": [{"data": [[1.0, 56.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2944.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 1120.8020508247873, "minX": 1.54961856E12, "maxY": 1352.9365918097737, "series": [{"data": [[1.54961856E12, 1352.9365918097737], [1.54961862E12, 1120.8020508247873]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961862E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 922.0, "minX": 1.0, "maxY": 23349.0, "series": [{"data": [[2.0, 20647.0], [3.0, 20776.0], [5.0, 20717.0], [6.0, 20814.0], [7.0, 21633.0], [8.0, 20526.0], [10.0, 20682.5], [11.0, 20701.0], [12.0, 20582.0], [14.0, 21023.5], [15.0, 20529.0], [16.0, 20980.0], [17.0, 20678.0], [18.0, 20813.0], [19.0, 20634.0], [21.0, 20869.0], [22.0, 20568.0], [23.0, 20533.0], [24.0, 20678.0], [25.0, 20663.0], [26.0, 20517.0], [27.0, 21624.0], [28.0, 21523.0], [29.0, 20665.0], [30.0, 20542.0], [31.0, 20701.0], [33.0, 20550.0], [32.0, 20694.0], [35.0, 20974.0], [37.0, 20665.5], [39.0, 21533.0], [38.0, 20516.0], [41.0, 21152.5], [43.0, 21126.0], [42.0, 20490.0], [45.0, 21331.0], [44.0, 20613.0], [47.0, 21730.0], [46.0, 20970.0], [49.0, 21194.0], [48.0, 21444.0], [51.0, 21379.0], [50.0, 20774.0], [52.0, 20683.0], [55.0, 20611.0], [54.0, 21104.0], [57.0, 21174.0], [59.0, 20563.0], [58.0, 20669.0], [61.0, 21124.0], [60.0, 20520.0], [63.0, 20589.0], [67.0, 21151.5], [65.0, 20898.0], [64.0, 20639.5], [71.0, 21435.0], [70.0, 20470.0], [69.0, 20542.0], [68.0, 21120.0], [74.0, 20665.0], [73.0, 21121.0], [72.0, 20524.0], [79.0, 20548.0], [78.0, 21225.0], [77.0, 20628.0], [76.0, 21150.5], [83.0, 20404.0], [82.0, 20419.0], [81.0, 21512.0], [80.0, 21005.0], [87.0, 20835.0], [86.0, 21147.0], [85.0, 20624.0], [84.0, 21113.0], [91.0, 20477.0], [90.0, 20688.0], [89.0, 20786.5], [95.0, 20686.0], [94.0, 20726.0], [93.0, 20461.0], [92.0, 21603.0], [99.0, 20460.0], [98.0, 20656.0], [97.0, 21720.0], [96.0, 20567.0], [103.0, 20490.0], [102.0, 21362.0], [101.0, 20639.0], [100.0, 21612.0], [107.0, 21637.0], [106.0, 21425.0], [105.0, 20617.0], [104.0, 20610.0], [111.0, 20917.0], [110.0, 20869.0], [109.0, 20558.0], [108.0, 21472.0], [115.0, 20876.0], [114.0, 20614.0], [113.0, 21107.0], [112.0, 21246.0], [118.0, 7231.0], [119.0, 20467.0], [117.0, 20801.0], [123.0, 20697.0], [122.0, 20508.0], [121.0, 21281.0], [120.0, 20379.0], [126.0, 21351.0], [125.0, 21568.0], [124.0, 21394.0], [134.0, 20897.0], [133.0, 20439.0], [132.0, 21573.0], [131.0, 20681.0], [130.0, 20469.0], [129.0, 20802.0], [128.0, 20920.0], [137.0, 7308.0], [136.0, 14382.0], [138.0, 10843.5], [143.0, 21239.0], [142.0, 20777.0], [141.0, 20430.0], [140.0, 21677.0], [139.0, 21038.0], [151.0, 20486.0], [150.0, 20721.0], [149.0, 21171.0], [148.0, 20952.0], [147.0, 21249.0], [146.0, 21570.0], [145.0, 20839.0], [144.0, 20463.0], [153.0, 10517.0], [154.0, 10594.0], [158.0, 10476.5], [159.0, 20804.0], [157.0, 20676.0], [156.0, 20626.0], [155.0, 20948.0], [152.0, 21095.0], [167.0, 21049.0], [166.0, 21494.0], [165.0, 21067.0], [164.0, 20608.0], [163.0, 20557.0], [162.0, 20490.0], [161.0, 21578.0], [160.0, 20509.0], [170.0, 10789.0], [175.0, 10622.0], [174.0, 20414.0], [173.0, 21559.0], [172.0, 20892.0], [171.0, 21457.0], [169.0, 21282.0], [168.0, 20717.0], [178.0, 7682.666666666667], [181.0, 10783.5], [183.0, 7573.0], [182.0, 20565.0], [180.0, 21065.0], [179.0, 21291.0], [177.0, 20670.0], [176.0, 20541.0], [187.0, 11119.5], [191.0, 10828.0], [190.0, 21536.0], [189.0, 20872.0], [188.0, 20674.0], [186.0, 21543.0], [185.0, 21564.0], [184.0, 20460.0], [193.0, 922.0], [198.0, 11153.5], [199.0, 21103.0], [197.0, 21143.0], [196.0, 21572.0], [195.0, 20471.0], [194.0, 21275.0], [192.0, 20646.0], [207.0, 20211.0], [206.0, 20733.0], [205.0, 20492.0], [204.0, 20410.0], [203.0, 20932.0], [202.0, 20911.0], [201.0, 20447.0], [210.0, 7795.666666666667], [209.0, 11065.5], [211.0, 10564.0], [215.0, 7717.333333333333], [214.0, 21044.0], [213.0, 20989.0], [212.0, 21025.0], [208.0, 21115.0], [223.0, 11036.0], [222.0, 21145.0], [221.0, 20915.0], [220.0, 21243.0], [219.0, 21201.0], [218.0, 20797.0], [217.0, 20375.0], [216.0, 20393.0], [224.0, 10557.0], [229.0, 11154.5], [230.0, 7564.333333333333], [231.0, 10746.5], [228.0, 20410.0], [227.0, 21150.0], [226.0, 20500.0], [225.0, 20763.0], [235.0, 11190.0], [239.0, 7627.666666666667], [238.0, 11149.0], [237.0, 20501.0], [236.0, 21317.0], [234.0, 19953.0], [233.0, 20415.0], [232.0, 20992.0], [241.0, 1114.0], [240.0, 10662.0], [244.0, 10926.5], [247.0, 20665.0], [246.0, 20718.0], [245.0, 20400.0], [243.0, 21036.0], [242.0, 21514.5], [253.0, 10636.5], [252.0, 10988.5], [255.0, 21263.0], [254.0, 20667.0], [251.0, 20578.0], [250.0, 20796.0], [249.0, 20872.0], [248.0, 20169.0], [268.0, 10694.5], [258.0, 11676.0], [257.0, 20725.0], [256.0, 20791.0], [259.0, 20208.0], [262.0, 4367.833333333333], [261.0, 21205.0], [260.0, 20553.0], [263.0, 10692.5], [269.0, 10755.5], [270.0, 11275.5], [271.0, 10765.5], [265.0, 20342.0], [264.0, 21020.0], [267.0, 21030.0], [266.0, 20282.0], [286.0, 20321.0], [272.0, 11011.5], [274.0, 23349.0], [273.0, 20431.0], [279.0, 20097.0], [278.0, 20684.0], [277.0, 20168.0], [276.0, 20424.0], [275.0, 7753.0], [287.0, 20860.0], [285.0, 20981.0], [284.0, 20478.0], [283.0, 20033.0], [282.0, 19973.0], [281.0, 20703.0], [280.0, 20834.0], [302.0, 20585.0], [303.0, 20058.0], [301.0, 20834.0], [300.0, 20147.0], [299.0, 22256.0], [298.0, 20879.0], [297.0, 20342.0], [296.0, 20715.0], [295.0, 21041.0], [289.0, 20284.0], [288.0, 20800.0], [291.0, 20833.0], [290.0, 20188.0], [294.0, 20167.0], [293.0, 21936.0], [292.0, 20248.0], [318.0, 21174.0], [319.0, 19782.0], [317.0, 20378.0], [316.0, 20553.0], [315.0, 20753.0], [314.0, 19987.0], [313.0, 20735.0], [312.0, 20215.0], [311.0, 19991.0], [305.0, 20661.0], [304.0, 20459.0], [307.0, 19989.0], [306.0, 19891.0], [310.0, 20067.0], [309.0, 20293.0], [308.0, 20513.0], [334.0, 20405.0], [335.0, 20685.0], [333.0, 19994.0], [332.0, 20778.0], [331.0, 20411.0], [330.0, 20666.0], [329.0, 20729.0], [328.0, 20566.0], [327.0, 21347.0], [321.0, 20644.0], [320.0, 22820.0], [323.0, 20022.0], [322.0, 20789.0], [326.0, 20237.0], [325.0, 20361.0], [324.0, 20091.0], [350.0, 20188.0], [351.0, 19574.0], [349.0, 22725.0], [348.0, 20104.0], [347.0, 20509.0], [346.0, 20645.0], [345.0, 21383.0], [344.0, 20359.0], [343.0, 20206.0], [337.0, 20103.0], [336.0, 19908.0], [339.0, 20345.0], [338.0, 20122.0], [342.0, 19785.0], [341.0, 20435.0], [340.0, 20145.0], [366.0, 20281.0], [367.0, 19688.0], [365.0, 20674.0], [364.0, 20556.0], [363.0, 20459.0], [362.0, 19963.0], [361.0, 20477.0], [360.0, 19778.0], [359.0, 21024.0], [353.0, 21174.0], [352.0, 20253.0], [355.0, 20600.0], [354.0, 19797.0], [358.0, 20408.0], [357.0, 19726.0], [356.0, 20549.0], [380.0, 19846.5], [382.0, 19798.0], [383.0, 19656.0], [381.0, 19695.0], [378.0, 20185.0], [376.0, 19491.0], [375.0, 20513.0], [369.0, 19901.0], [368.0, 20174.0], [371.0, 21265.0], [370.0, 21648.0], [374.0, 19500.0], [373.0, 20934.0], [372.0, 20580.0], [398.0, 19434.0], [399.0, 20813.0], [397.0, 19726.0], [396.0, 21621.0], [395.0, 22434.0], [394.0, 19853.0], [393.0, 20007.0], [392.0, 20145.0], [391.0, 19951.0], [384.0, 20203.0], [387.0, 19732.0], [386.0, 19988.5], [390.0, 19724.0], [389.0, 20276.0], [388.0, 20376.0], [414.0, 19689.0], [415.0, 22635.0], [413.0, 20525.0], [412.0, 22404.0], [411.0, 19751.0], [410.0, 20099.0], [409.0, 20198.0], [408.0, 20630.0], [407.0, 20006.0], [400.0, 19815.0], [403.0, 19325.0], [402.0, 21222.0], [406.0, 19590.0], [405.0, 22629.0], [404.0, 20207.0], [430.0, 19740.0], [431.0, 19065.0], [429.0, 18543.0], [428.0, 18527.0], [427.0, 19406.0], [426.0, 19040.0], [425.0, 20798.0], [424.0, 19762.0], [423.0, 19507.0], [417.0, 20260.0], [416.0, 19454.0], [419.0, 19070.0], [418.0, 19423.0], [421.0, 19534.0], [420.0, 20896.0], [446.0, 21585.0], [447.0, 20280.0], [445.0, 18342.0], [444.0, 20094.0], [443.0, 19320.0], [442.0, 20408.0], [441.0, 19230.0], [440.0, 21576.0], [439.0, 20739.0], [433.0, 19797.0], [432.0, 20647.0], [435.0, 20757.0], [434.0, 19669.0], [438.0, 20353.0], [437.0, 19322.0], [436.0, 20228.0], [462.0, 21218.0], [449.0, 11223.0], [451.0, 6381.75], [450.0, 19953.0], [452.0, 8029.0], [453.0, 21331.0], [455.0, 20239.0], [448.0, 20418.0], [454.0, 19733.0], [463.0, 19410.0], [456.0, 18318.0], [461.0, 19840.0], [460.0, 21407.0], [459.0, 19161.0], [458.0, 19709.5], [478.0, 19978.0], [477.0, 13462.666666666666], [467.0, 21076.0], [466.0, 19317.0], [465.0, 20406.0], [464.0, 20010.0], [479.0, 11057.0], [475.0, 20246.0], [474.0, 19799.0], [473.0, 19543.0], [472.0, 21066.0], [471.0, 19483.5], [469.0, 19839.0], [468.0, 19487.0], [494.0, 19160.0], [480.0, 10756.5], [481.0, 21015.0], [483.0, 19361.0], [482.0, 20060.0], [495.0, 19296.0], [493.0, 19726.0], [492.0, 19041.5], [491.0, 19474.0], [489.0, 19356.0], [488.0, 19833.0], [487.0, 19266.0], [486.0, 19423.0], [485.0, 20993.0], [484.0, 21049.0], [510.0, 20745.0], [498.0, 1986.0], [502.0, 10824.5], [501.0, 19666.0], [500.0, 18873.0], [503.0, 18560.0], [497.0, 20898.0], [496.0, 19510.0], [511.0, 19330.0], [509.0, 19531.0], [508.0, 19531.0], [499.0, 20807.0], [507.0, 18922.0], [506.0, 19767.0], [505.0, 19785.0], [504.0, 18982.0], [540.0, 20351.0], [542.0, 19173.0], [536.0, 18912.0], [516.0, 19836.0], [514.0, 19032.0], [512.0, 19545.0], [532.0, 18727.0], [530.0, 19625.0], [528.0, 19537.0], [526.0, 18915.0], [524.0, 19442.0], [522.0, 20621.0], [520.0, 19150.0], [574.0, 19221.0], [548.0, 10430.5], [546.0, 10485.5], [544.0, 20377.0], [558.0, 18890.0], [556.0, 19368.0], [554.0, 20307.0], [552.0, 18588.0], [562.0, 10512.5], [560.0, 19422.0], [572.0, 19142.0], [570.0, 18911.0], [568.0, 19157.0], [550.0, 18515.0], [566.0, 18967.0], [564.0, 18903.0], [604.0, 20011.0], [576.0, 10391.0], [578.0, 20085.0], [582.0, 18061.0], [580.0, 19000.0], [590.0, 18992.0], [588.0, 18371.0], [586.0, 18623.0], [584.0, 20121.0], [606.0, 17974.0], [602.0, 18515.0], [600.0, 18493.0], [598.0, 18404.0], [596.0, 18041.0], [594.0, 19025.0], [592.0, 18781.0], [638.0, 18147.0], [624.0, 10482.5], [636.0, 18011.0], [634.0, 18522.0], [632.0, 17969.0], [614.0, 18175.0], [612.0, 19994.0], [608.0, 18251.0], [630.0, 18157.0], [628.0, 18771.0], [626.0, 18094.0], [622.0, 18618.0], [620.0, 19139.0], [618.0, 18652.0], [616.0, 17882.0], [668.0, 17708.0], [670.0, 17312.0], [666.0, 17577.0], [664.0, 18355.0], [662.0, 17975.0], [660.0, 17382.0], [658.0, 19389.0], [656.0, 17577.0], [654.0, 19011.0], [642.0, 18390.0], [640.0, 17875.0], [646.0, 17874.0], [644.0, 18034.0], [652.0, 18350.0], [650.0, 17456.0], [648.0, 19396.0], [700.0, 17289.0], [674.0, 13133.333333333334], [672.0, 17951.0], [678.0, 19465.0], [676.0, 18244.0], [686.0, 17275.0], [684.0, 17198.0], [682.0, 17832.0], [680.0, 17414.0], [702.0, 18292.0], [698.0, 17086.0], [696.0, 17779.0], [694.0, 17149.0], [692.0, 19032.0], [690.0, 19366.0], [688.0, 17889.0], [708.0, 17768.0], [710.0, 10752.0], [718.0, 18233.0], [706.0, 17150.0], [704.0, 18160.0], [716.0, 17513.0], [714.0, 17541.0], [712.0, 19178.0], [728.0, 16844.0], [720.0, 10698.5], [722.0, 16802.0], [724.0, 18792.0], [726.0, 16961.0], [734.0, 17381.0], [732.0, 18876.0], [730.0, 17937.0], [750.0, 9829.0], [748.0, 7855.666666666667], [746.0, 17176.0], [744.0, 17616.0], [736.0, 17121.0], [738.0, 17235.0], [756.0, 10057.0], [754.0, 17445.0], [752.0, 18493.0], [758.0, 18833.0], [766.0, 18646.0], [764.0, 17225.0], [762.0, 17660.0], [760.0, 17288.0], [742.0, 17188.0], [740.0, 18050.0], [768.0, 17553.0], [770.0, 17313.0], [782.0, 17032.0], [780.0, 18341.0], [778.0, 18405.0], [776.0, 17334.0], [772.0, 9780.0], [788.0, 10298.5], [786.0, 17532.0], [784.0, 17243.0], [790.0, 16695.0], [798.0, 17292.0], [796.0, 16819.0], [794.0, 17183.0], [792.0, 18336.0], [774.0, 18327.0], [800.0, 17202.0], [814.0, 7741.333333333333], [806.0, 9636.0], [802.0, 16276.0], [804.0, 17077.0], [824.0, 16922.0], [808.0, 9674.5], [810.0, 10115.5], [812.0, 17981.0], [818.0, 16760.0], [816.0, 17380.0], [820.0, 17099.0], [822.0, 16264.0], [830.0, 16339.0], [828.0, 17045.0], [826.0, 18194.0], [858.0, 17149.0], [862.0, 17872.0], [840.0, 7801.0], [850.0, 8083.666666666667], [854.0, 17026.0], [852.0, 17023.0], [848.0, 17748.0], [860.0, 16759.0], [856.0, 16142.0], [832.0, 17299.0], [834.0, 18068.0], [836.0, 17902.0], [838.0, 15854.0], [846.0, 17337.0], [844.0, 16454.0], [842.0, 16829.0], [866.0, 7854.666666666667], [892.0, 9182.0], [876.0, 10082.0], [874.0, 15713.0], [872.0, 16808.0], [864.0, 15723.0], [878.0, 15738.0], [882.0, 10267.5], [880.0, 16644.0], [884.0, 17437.0], [886.0, 16510.0], [888.0, 10504.5], [870.0, 16843.0], [868.0, 15788.0], [894.0, 17380.0], [890.0, 17086.0], [926.0, 16564.0], [918.0, 9996.0], [916.0, 16350.0], [914.0, 16661.0], [920.0, 17322.0], [902.0, 16678.0], [900.0, 17455.0], [898.0, 15370.0], [896.0, 17330.0], [910.0, 16629.0], [908.0, 16806.0], [906.0, 16513.0], [904.0, 16663.0], [912.0, 16509.0], [924.0, 16425.0], [922.0, 16401.0], [930.0, 16294.0], [932.0, 9971.5], [936.0, 9933.0], [942.0, 9999.0], [940.0, 16517.0], [938.0, 16489.0], [928.0, 17464.0], [944.0, 16527.0], [946.0, 16281.0], [948.0, 16358.0], [950.0, 16074.0], [952.0, 16029.0], [934.0, 16455.0], [954.0, 9611.5], [956.0, 16920.0], [958.0, 16236.0], [984.0, 15466.0], [988.0, 15398.0], [964.0, 9916.0], [968.0, 9785.0], [966.0, 16504.0], [986.0, 15645.0], [976.0, 15733.0], [990.0, 16265.0], [974.0, 10170.5], [972.0, 16136.0], [970.0, 16394.0], [960.0, 16935.0], [962.0, 16533.0], [980.0, 8142.666666666667], [982.0, 16396.0], [978.0, 9755.0], [992.0, 7834.0], [1020.0, 15948.0], [998.0, 9357.0], [994.0, 16266.0], [1016.0, 15124.0], [1006.0, 15194.0], [1004.0, 9638.0], [1002.0, 15394.0], [1000.0, 15411.0], [1008.0, 15176.0], [1010.0, 15338.0], [1012.0, 16253.0], [1014.0, 15448.0], [1022.0, 16177.0], [1018.0, 16317.0], [1072.0, 15268.0], [1056.0, 9149.0], [1060.0, 9812.5], [1064.0, 7823.0], [1068.0, 15800.5], [1036.0, 16105.0], [1032.0, 14873.0], [1028.0, 15909.0], [1024.0, 15242.0], [1052.0, 14775.0], [1048.0, 15743.0], [1044.0, 15881.0], [1040.0, 15795.0], [1076.0, 14532.0], [1084.0, 15845.0], [1080.0, 15291.0], [1144.0, 14703.0], [1140.0, 9794.5], [1088.0, 9400.5], [1092.0, 15295.0], [1120.0, 14332.0], [1124.0, 14052.0], [1128.0, 14174.0], [1148.0, 15116.0], [1136.0, 9192.0], [1100.0, 14390.0], [1096.0, 15429.0], [1132.0, 14834.0], [1104.0, 6514.75], [1108.0, 9502.0], [1112.0, 15423.0], [1164.0, 15139.0], [1208.0, 9889.5], [1156.0, 8699.0], [1152.0, 14981.0], [1160.0, 14868.0], [1200.0, 13535.0], [1180.0, 9790.5], [1184.0, 14595.0], [1212.0, 14751.0], [1204.0, 5893.0], [1192.0, 14659.0], [1188.0, 13706.0], [1196.0, 9601.0], [1168.0, 9264.0], [1172.0, 9386.5], [1176.0, 15283.0], [1228.0, 14647.0], [1224.0, 7779.666666666666], [1216.0, 7951.0], [1220.0, 14592.0], [1264.0, 13874.0], [1268.0, 14274.0], [1248.0, 6720.25], [1252.0, 14719.0], [1276.0, 13801.0], [1272.0, 14137.0], [1256.0, 4132.0], [1260.0, 13535.0], [1232.0, 7690.666666666666], [1236.0, 14700.0], [1240.0, 9432.0], [1244.0, 15379.0], [1292.0, 8882.5], [1288.0, 7685.0], [1284.0, 14608.0], [1280.0, 14285.5], [1308.0, 14757.0], [1304.0, 6459.5], [1312.0, 7116.666666666666], [1340.0, 6731.6], [1336.0, 7458.0], [1328.0, 7741.333333333334], [1332.0, 7618.666666666666], [1320.0, 7969.666666666666], [1324.0, 13981.0], [1316.0, 13681.0], [1296.0, 13791.0], [1300.0, 14392.0], [1356.0, 8063.333333333334], [1344.0, 13827.0], [1348.0, 14549.0], [1352.0, 13553.0], [1372.0, 13975.0], [1368.0, 7160.0], [1392.0, 14080.0], [1396.0, 13509.0], [1400.0, 13670.0], [1376.0, 13675.0], [1404.0, 13433.0], [1380.0, 7274.0], [1388.0, 7263.0], [1384.0, 9323.0], [1360.0, 9727.5], [1364.0, 7757.333333333334], [1408.0, 13563.0], [1412.0, 6453.75], [1436.0, 9438.5], [1432.0, 9506.5], [1428.0, 13076.0], [1424.0, 13165.0], [1416.0, 9119.5], [1420.0, 8788.0], [1440.0, 13227.0], [1448.0, 13950.0], [1452.0, 13204.0], [1468.0, 13422.0], [1464.0, 13066.0], [1460.0, 13558.0], [1456.0, 13130.0], [1528.0, 12510.0], [1504.0, 12919.0], [1508.0, 13119.0], [1512.0, 12196.0], [1532.0, 12144.0], [1524.0, 12020.0], [1520.0, 12359.0], [1472.0, 13006.0], [1476.0, 13535.0], [1480.0, 12992.0], [1500.0, 12560.0], [1496.0, 13513.0], [1492.0, 13011.0], [1488.0, 13336.0], [1516.0, 12226.0], [1596.0, 9028.0], [1588.0, 9127.0], [1576.0, 8537.5], [1580.0, 8422.0], [1568.0, 11678.0], [1572.0, 11548.0], [1592.0, 9306.0], [1584.0, 7339.666666666666], [1536.0, 12826.0], [1540.0, 11913.0], [1544.0, 12033.0], [1548.0, 12306.0], [1564.0, 12531.0], [1560.0, 11512.0], [1556.0, 12425.0], [1552.0, 11887.0], [1656.0, 10882.0], [1608.0, 6448.6], [1632.0, 12027.0], [1652.0, 8096.5], [1648.0, 11757.0], [1612.0, 11727.0], [1636.0, 8659.0], [1644.0, 7876.0], [1640.0, 12139.0], [1604.0, 7133.0], [1600.0, 9174.5], [1628.0, 6510.0], [1624.0, 10888.0], [1620.0, 11648.0], [1616.0, 12380.0], [1672.0, 11614.0], [1720.0, 8800.5], [1664.0, 8293.5], [1692.0, 10656.0], [1668.0, 11316.0], [1716.0, 11400.0], [1712.0, 10288.0], [1724.0, 10254.0], [1680.0, 8338.0], [1684.0, 10638.0], [1688.0, 10917.0], [1700.0, 11213.0], [1696.0, 11637.0], [1704.0, 11421.0], [1708.0, 11514.0], [1732.0, 11287.0], [1728.0, 7808.5], [1756.0, 10044.0], [1748.0, 10475.0], [1744.0, 11149.0], [1752.0, 12284.0], [1740.0, 8958.0], [1788.0, 10254.0], [1784.0, 13514.0], [1780.0, 10875.0], [1776.0, 10877.0], [1768.0, 10947.0], [1764.0, 10918.0], [1760.0, 10078.0], [1772.0, 11675.0], [1796.0, 12134.0], [1800.0, 10634.0], [1792.0, 10017.0], [1820.0, 10522.0], [1808.0, 8955.5], [1812.0, 10604.0], [1816.0, 9704.0], [1804.0, 8057.5], [1824.0, 8111.0], [1852.0, 7205.625], [1848.0, 8675.0], [1844.0, 10015.5], [1840.0, 10276.0], [1828.0, 12949.0], [1832.0, 11953.0], [1836.0, 13002.0], [1860.0, 10018.0], [1856.0, 10197.0], [1864.0, 9895.0], [1884.0, 9548.0], [1880.0, 9419.0], [1876.0, 9454.0], [1904.0, 9316.0], [1908.0, 8941.0], [1912.0, 8174.0], [1916.0, 9291.0], [1888.0, 9475.0], [1892.0, 9836.0], [1896.0, 9522.0], [1900.0, 9750.0], [1868.0, 9996.0], [1872.0, 7865.5], [1928.0, 9485.0], [1976.0, 10570.0], [1920.0, 8572.0], [1948.0, 9314.0], [1924.0, 9493.0], [1960.0, 7448.333333333333], [1956.0, 9221.0], [1952.0, 9036.0], [1980.0, 11430.0], [1972.0, 8817.5], [1968.0, 8743.0], [1932.0, 9431.0], [1964.0, 9113.0], [1940.0, 9031.0], [1936.0, 9339.0], [1944.0, 8115.0], [1988.0, 10305.0], [1996.0, 8564.5], [1984.0, 8963.0], [1992.0, 10097.0], [2012.0, 8817.0], [2000.0, 8267.5], [2004.0, 11387.0], [2008.0, 11329.0], [2016.0, 8788.0], [2044.0, 9334.0], [2040.0, 9278.0], [2036.0, 8544.0], [2032.0, 8418.0], [2028.0, 8772.0], [2024.0, 7747.5], [2020.0, 8710.0], [2144.0, 8440.0], [2096.0, 7480.333333333333], [2072.0, 7369.0], [2064.0, 8594.0], [2056.0, 7998.0], [2152.0, 9442.0], [2160.0, 7389.0], [2168.0, 9566.0], [2112.0, 7539.0], [2120.0, 8441.5], [2128.0, 8192.0], [2136.0, 8185.0], [2080.0, 8443.0], [2088.0, 7600.0], [2104.0, 8505.0], [2048.0, 8054.0], [2184.0, 7152.5], [2176.0, 8160.5], [2200.0, 8532.5], [2192.0, 8109.0], [2073.0, 8971.0], [2145.0, 7757.249999999999], [2049.0, 7976.0], [2057.0, 8824.0], [2065.0, 7905.0], [2153.0, 7691.0], [2161.0, 8007.0], [2169.0, 8117.0], [2121.0, 9818.0], [2113.0, 7324.0], [2081.0, 7350.0], [2089.0, 8252.0], [2097.0, 9005.0], [2105.0, 8209.0], [2129.0, 9898.0], [2137.0, 7902.0], [2193.0, 8206.5], [2177.0, 7739.0], [2185.0, 8385.5], [2201.0, 7396.0], [1029.0, 16011.0], [1073.0, 7658.333333333333], [1057.0, 9592.5], [1061.0, 14881.0], [1065.0, 15645.0], [1025.0, 15276.0], [1033.0, 16440.0], [1037.0, 15991.0], [1053.0, 14910.0], [1049.0, 15660.0], [1045.0, 14957.0], [1041.0, 14885.0], [1085.0, 14566.0], [1081.0, 15700.0], [1069.0, 15539.0], [1137.0, 14627.0], [1141.0, 9546.0], [1093.0, 7841.666666666666], [1097.0, 15781.0], [1101.0, 15116.0], [1149.0, 14913.0], [1145.0, 14053.0], [1121.0, 14189.0], [1125.0, 15339.0], [1129.0, 14771.0], [1133.0, 15139.0], [1105.0, 5424.5], [1109.0, 8965.5], [1113.0, 15375.0], [1089.0, 15373.0], [1117.0, 14857.5], [1165.0, 8910.5], [1205.0, 7143.333333333334], [1153.0, 13829.0], [1157.0, 14674.0], [1181.0, 9038.0], [1177.0, 14984.0], [1161.0, 14809.0], [1185.0, 7705.0], [1189.0, 14595.0], [1193.0, 14130.0], [1209.0, 14736.0], [1213.0, 15040.0], [1201.0, 15046.0], [1197.0, 14295.0], [1169.0, 9007.0], [1173.0, 9630.5], [1265.0, 9038.5], [1245.0, 9410.0], [1225.0, 7620.0], [1221.0, 14281.0], [1217.0, 14732.0], [1229.0, 13848.0], [1269.0, 7600.333333333334], [1261.0, 7437.333333333334], [1257.0, 11135.666666666666], [1277.0, 14346.0], [1249.0, 13749.0], [1273.0, 15131.0], [1233.0, 7893.0], [1237.0, 13902.0], [1241.0, 14357.0], [1293.0, 9521.5], [1281.0, 14139.0], [1285.0, 13747.0], [1289.0, 13899.0], [1309.0, 13639.0], [1305.0, 7133.0], [1329.0, 14144.0], [1341.0, 5828.714285714286], [1337.0, 6709.75], [1333.0, 13241.0], [1313.0, 6944.5], [1317.0, 8714.0], [1321.0, 6604.8], [1325.0, 8905.0], [1301.0, 10018.5], [1297.0, 14487.0], [1353.0, 7523.666666666666], [1397.0, 13410.0], [1349.0, 13878.0], [1345.0, 13483.0], [1369.0, 6550.6], [1373.0, 8753.5], [1357.0, 9884.5], [1401.0, 8857.5], [1405.0, 7089.5], [1393.0, 8852.5], [1377.0, 9054.0], [1389.0, 9620.5], [1385.0, 8865.0], [1381.0, 14382.0], [1361.0, 13693.0], [1365.0, 8680.0], [1413.0, 9327.0], [1409.0, 9457.0], [1433.0, 7222.5], [1437.0, 13272.0], [1425.0, 13937.0], [1429.0, 13387.0], [1417.0, 8325.0], [1421.0, 8398.333333333334], [1457.0, 12963.0], [1461.0, 14517.0], [1465.0, 14004.0], [1445.0, 13384.5], [1449.0, 14183.0], [1453.0, 13584.0], [1469.0, 12999.0], [1529.0, 12154.0], [1505.0, 11936.0], [1509.0, 12136.0], [1513.0, 12650.0], [1533.0, 12622.0], [1525.0, 12530.0], [1521.0, 11914.0], [1473.0, 12963.0], [1477.0, 13723.0], [1481.0, 13616.0], [1485.0, 13719.5], [1501.0, 11865.0], [1497.0, 13890.0], [1493.0, 12776.0], [1489.0, 12750.0], [1517.0, 13097.0], [1597.0, 7228.75], [1589.0, 8934.0], [1569.0, 11934.0], [1573.0, 12450.0], [1577.0, 7659.333333333334], [1581.0, 12782.0], [1593.0, 7736.0], [1585.0, 7464.333333333334], [1537.0, 12371.0], [1541.0, 11900.0], [1545.0, 12467.0], [1549.0, 12808.0], [1565.0, 12056.0], [1561.0, 12568.0], [1557.0, 11971.0], [1553.0, 11925.0], [1661.0, 11248.5], [1633.0, 6426.0], [1657.0, 10733.0], [1653.0, 11980.0], [1649.0, 10930.0], [1645.0, 8262.5], [1637.0, 11028.0], [1641.0, 11627.0], [1609.0, 7263.75], [1613.0, 11756.0], [1605.0, 7929.333333333333], [1601.0, 7233.666666666667], [1629.0, 11950.0], [1621.0, 11933.0], [1617.0, 11311.0], [1625.0, 11704.0], [1665.0, 11729.0], [1677.0, 9581.666666666666], [1673.0, 10618.0], [1669.0, 11858.0], [1693.0, 11293.0], [1689.0, 10567.0], [1685.0, 10516.0], [1681.0, 10665.0], [1713.0, 7916.0], [1709.0, 11492.0], [1705.0, 11420.0], [1701.0, 10989.0], [1697.0, 10679.0], [1725.0, 10474.0], [1721.0, 11369.0], [1717.0, 11211.0], [1729.0, 9282.333333333334], [1777.0, 7231.0], [1757.0, 9395.0], [1745.0, 8101.5], [1749.0, 12141.0], [1753.0, 11081.0], [1733.0, 11107.0], [1737.0, 4995.333333333333], [1741.0, 10627.0], [1785.0, 10374.0], [1781.0, 10116.0], [1789.0, 10705.0], [1761.0, 10710.0], [1765.0, 11017.0], [1769.0, 10735.0], [1773.0, 9971.0], [1797.0, 10076.0], [1793.0, 9214.5], [1821.0, 7751.25], [1813.0, 10073.0], [1809.0, 10590.0], [1817.0, 8919.0], [1801.0, 7333.333333333333], [1805.0, 10647.0], [1853.0, 8547.0], [1849.0, 7563.0], [1841.0, 11282.0], [1845.0, 8702.5], [1825.0, 8777.0], [1829.0, 10457.0], [1833.0, 10480.0], [1837.0, 7249.0], [1861.0, 11811.0], [1865.0, 8655.333333333334], [1857.0, 11261.0], [1885.0, 11626.0], [1881.0, 9050.0], [1877.0, 8544.0], [1905.0, 8922.0], [1909.0, 9561.0], [1913.0, 8094.0], [1917.0, 9555.0], [1889.0, 9898.0], [1893.0, 9288.0], [1897.0, 9723.0], [1901.0, 9553.0], [1869.0, 8183.0], [1873.0, 7913.0], [1929.0, 9155.0], [1973.0, 7700.0], [1921.0, 11034.0], [1949.0, 9553.0], [1925.0, 7814.333333333333], [1957.0, 9170.0], [1953.0, 9139.0], [1981.0, 8933.0], [1977.0, 9011.0], [1933.0, 9245.0], [1969.0, 7475.333333333333], [1961.0, 5812.5], [1965.0, 9894.0], [1937.0, 9333.0], [1941.0, 9336.0], [1945.0, 9315.0], [1989.0, 11494.0], [1997.0, 10254.0], [1985.0, 8913.0], [2013.0, 10346.0], [2001.0, 10459.0], [2005.0, 8792.0], [2009.0, 8854.0], [2017.0, 10486.0], [2045.0, 7462.0], [2041.0, 8853.0], [2037.0, 9455.0], [2033.0, 8713.0], [2021.0, 8577.5], [2025.0, 8155.666666666667], [2029.0, 8276.0], [2146.0, 8574.5], [2066.0, 9482.0], [2058.0, 7977.0], [2074.0, 9057.0], [2154.0, 7837.333333333333], [2162.0, 8548.5], [2170.0, 8284.0], [2114.0, 8848.0], [2122.0, 9723.0], [2130.0, 9726.0], [2138.0, 8428.0], [2082.0, 7575.0], [2090.0, 10111.0], [2098.0, 8810.0], [2106.0, 8856.0], [2050.0, 8030.0], [2178.0, 8003.5], [2186.0, 7342.0], [2202.0, 9166.0], [2194.0, 7455.0], [2075.0, 7772.0], [2051.0, 10484.0], [2059.0, 7888.0], [2067.0, 7900.0], [2147.0, 8256.0], [2155.0, 8591.0], [2163.0, 8667.0], [2171.0, 8068.0], [2123.0, 8259.0], [2115.0, 8913.0], [2083.0, 7653.0], [2091.0, 7612.0], [2099.0, 8199.0], [2107.0, 8449.0], [2131.0, 7735.333333333333], [2139.0, 7812.0], [2179.0, 3216.0], [2187.0, 9416.0], [2195.0, 9036.0], [541.0, 19415.0], [523.0, 10462.0], [521.0, 20576.0], [527.0, 18583.0], [515.0, 19317.0], [513.0, 19642.0], [519.0, 19102.0], [517.0, 19649.0], [525.0, 20710.0], [543.0, 18954.0], [539.0, 19189.5], [537.0, 18714.0], [535.0, 19507.5], [533.0, 20432.0], [531.0, 20728.0], [529.0, 20517.0], [573.0, 18963.0], [551.0, 10758.5], [549.0, 18372.0], [547.0, 19384.0], [545.0, 20306.0], [559.0, 18778.0], [557.0, 19516.0], [555.0, 18597.0], [553.0, 19424.0], [575.0, 18349.0], [571.0, 18655.0], [569.0, 19514.0], [567.0, 19102.0], [565.0, 19169.0], [563.0, 18327.0], [561.0, 18454.0], [605.0, 18581.0], [607.0, 18942.0], [603.0, 18959.0], [601.0, 18368.0], [599.0, 19965.0], [597.0, 19880.0], [595.0, 18814.0], [593.0, 18352.0], [591.0, 18107.0], [579.0, 18465.0], [577.0, 20260.0], [583.0, 18432.0], [581.0, 18749.0], [589.0, 18554.0], [587.0, 18317.0], [585.0, 18926.0], [635.0, 19851.0], [611.0, 13349.666666666666], [613.0, 10421.5], [623.0, 10330.0], [609.0, 18074.0], [621.0, 18879.0], [619.0, 18720.0], [617.0, 17942.0], [629.0, 11073.0], [627.0, 18275.0], [625.0, 17878.0], [639.0, 18222.0], [637.0, 18109.0], [633.0, 19702.0], [615.0, 18470.0], [631.0, 19667.0], [669.0, 17333.0], [653.0, 7746.333333333333], [651.0, 19525.0], [649.0, 18221.0], [655.0, 17866.0], [643.0, 18548.0], [641.0, 17936.0], [647.0, 18035.0], [645.0, 18232.0], [671.0, 10882.5], [667.0, 17644.0], [665.0, 18081.0], [663.0, 17419.0], [661.0, 17682.0], [659.0, 19486.0], [657.0, 17401.0], [701.0, 19185.0], [687.0, 10000.5], [675.0, 19163.0], [679.0, 18268.0], [677.0, 17764.0], [685.0, 18235.0], [683.0, 19083.0], [681.0, 17363.0], [703.0, 18862.0], [699.0, 17392.0], [697.0, 18122.0], [695.0, 18051.0], [693.0, 17719.0], [691.0, 17063.0], [689.0, 18136.0], [707.0, 18082.0], [733.0, 16795.0], [719.0, 17089.0], [705.0, 19264.0], [709.0, 17044.0], [717.0, 19018.0], [715.0, 16996.0], [713.0, 17140.0], [711.0, 17448.0], [721.0, 18843.0], [723.0, 17013.0], [725.0, 18874.0], [727.0, 17707.0], [735.0, 17162.0], [731.0, 17720.0], [729.0, 18659.0], [739.0, 9829.5], [765.0, 18386.0], [747.0, 17224.0], [745.0, 18865.0], [749.0, 18013.0], [751.0, 10012.0], [737.0, 17187.0], [755.0, 16947.0], [753.0, 18615.0], [757.0, 18482.0], [759.0, 16629.0], [767.0, 17152.0], [763.0, 18718.0], [761.0, 18648.0], [743.0, 18659.0], [741.0, 18910.0], [771.0, 7587.333333333333], [797.0, 18074.0], [769.0, 17436.0], [783.0, 17134.0], [781.0, 17884.0], [779.0, 16565.0], [787.0, 17110.0], [785.0, 17881.0], [789.0, 18416.0], [791.0, 17654.0], [799.0, 17470.0], [795.0, 16628.0], [793.0, 18074.0], [775.0, 17832.0], [773.0, 17692.0], [801.0, 16729.0], [829.0, 16907.0], [815.0, 17288.0], [803.0, 17340.0], [805.0, 16572.0], [807.0, 16465.0], [809.0, 8000.333333333333], [811.0, 18150.0], [813.0, 17269.0], [819.0, 10077.5], [817.0, 17990.0], [821.0, 17170.0], [823.0, 18132.0], [825.0, 9804.0], [831.0, 9810.0], [827.0, 17977.0], [863.0, 16689.0], [841.0, 10019.0], [855.0, 10408.0], [853.0, 16759.0], [851.0, 16902.0], [849.0, 17365.0], [861.0, 17417.0], [859.0, 16872.0], [857.0, 16430.0], [847.0, 17254.0], [833.0, 17320.0], [835.0, 17108.0], [837.0, 18040.0], [839.0, 17863.0], [845.0, 18076.0], [843.0, 17680.0], [879.0, 17658.0], [875.0, 16693.0], [873.0, 17798.0], [877.0, 15625.0], [865.0, 16839.0], [881.0, 16039.0], [883.0, 16290.0], [885.0, 16707.0], [887.0, 17372.0], [871.0, 17245.0], [867.0, 17746.0], [889.0, 16551.0], [895.0, 15831.0], [893.0, 16736.0], [891.0, 16577.0], [903.0, 16687.0], [921.0, 10024.5], [913.0, 10771.0], [917.0, 16129.0], [915.0, 15622.0], [919.0, 16165.0], [901.0, 16567.0], [899.0, 15867.0], [897.0, 16595.0], [911.0, 16319.0], [909.0, 16527.0], [907.0, 16522.0], [905.0, 16473.0], [923.0, 9861.0], [927.0, 16562.0], [925.0, 17178.0], [929.0, 16331.0], [957.0, 13486.0], [937.0, 7976.0], [941.0, 16387.0], [939.0, 16367.0], [943.0, 17041.0], [931.0, 17234.0], [945.0, 10576.0], [947.0, 17085.0], [949.0, 16948.0], [951.0, 16361.0], [953.0, 8185.0], [935.0, 16561.0], [933.0, 16755.0], [955.0, 9991.0], [959.0, 10012.0], [967.0, 9671.5], [977.0, 9886.5], [965.0, 15402.0], [985.0, 15663.0], [987.0, 15077.0], [989.0, 16021.0], [991.0, 15156.0], [969.0, 9555.0], [973.0, 15425.0], [971.0, 15318.0], [975.0, 14668.0], [961.0, 16629.0], [963.0, 14684.0], [979.0, 6729.75], [981.0, 15573.0], [995.0, 16234.0], [997.0, 15738.5], [993.0, 15405.0], [999.0, 16645.0], [1017.0, 15162.0], [1005.0, 9646.5], [1007.0, 15475.0], [1003.0, 15257.0], [1001.0, 14989.0], [1023.0, 16091.0], [1009.0, 16069.0], [1011.0, 15966.0], [1013.0, 15039.0], [1015.0, 15068.0], [1021.0, 15293.0], [1019.0, 15327.0], [1082.0, 9613.0], [1074.0, 7722.333333333334], [1058.0, 15788.0], [1062.0, 15468.0], [1070.0, 9119.0], [1066.0, 14504.0], [1038.0, 16112.0], [1034.0, 14993.0], [1030.0, 15831.0], [1026.0, 15142.0], [1054.0, 15007.0], [1050.0, 15755.0], [1046.0, 14739.0], [1042.0, 14670.0], [1086.0, 14297.0], [1078.0, 15034.5], [1146.0, 14757.0], [1094.0, 8887.5], [1090.0, 15314.0], [1122.0, 9403.5], [1126.0, 15143.0], [1150.0, 15278.0], [1142.0, 14916.0], [1102.0, 15278.0], [1098.0, 15376.0], [1138.0, 9153.5], [1130.0, 9224.5], [1134.0, 9336.0], [1106.0, 7148.333333333334], [1110.0, 14468.0], [1114.0, 14381.0], [1118.0, 14378.0], [1202.0, 14612.0], [1154.0, 13769.0], [1158.0, 14767.0], [1166.0, 14634.0], [1182.0, 9406.0], [1178.0, 9659.5], [1214.0, 3241.0], [1210.0, 13975.0], [1206.0, 14611.0], [1186.0, 9567.0], [1194.0, 7420.333333333334], [1190.0, 14764.0], [1198.0, 14605.0], [1174.0, 14596.0], [1170.0, 9526.5], [1230.0, 14423.0], [1218.0, 9013.0], [1246.0, 7586.666666666666], [1222.0, 9506.5], [1266.0, 6384.75], [1226.0, 13353.0], [1270.0, 5896.333333333334], [1250.0, 14173.0], [1254.0, 14295.5], [1278.0, 14021.0], [1274.0, 14187.0], [1258.0, 6719.25], [1262.0, 9571.5], [1234.0, 14494.0], [1242.0, 14027.0], [1290.0, 14096.0], [1286.0, 7367.0], [1282.0, 13912.0], [1310.0, 6436.2], [1306.0, 6632.25], [1294.0, 13795.0], [1338.0, 6550.166666666667], [1342.0, 5802.555555555557], [1330.0, 14098.0], [1334.0, 13835.0], [1326.0, 13953.0], [1322.0, 13603.0], [1314.0, 9727.0], [1318.0, 14136.0], [1298.0, 10412.5], [1302.0, 9303.0], [1354.0, 14376.0], [1374.0, 7603.333333333334], [1346.0, 13752.0], [1350.0, 13837.0], [1370.0, 13560.0], [1366.0, 6438.8], [1358.0, 9008.5], [1394.0, 8958.5], [1398.0, 7748.0], [1402.0, 13342.0], [1406.0, 14386.0], [1378.0, 13325.0], [1382.0, 9650.0], [1386.0, 9394.5], [1390.0, 13835.0], [1362.0, 14366.0], [1414.0, 9875.5], [1422.0, 9481.0], [1434.0, 9724.5], [1438.0, 13797.0], [1410.0, 12896.0], [1430.0, 9331.5], [1426.0, 13591.0], [1418.0, 13347.0], [1470.0, 12893.0], [1446.0, 13845.0], [1442.0, 13017.0], [1450.0, 13223.0], [1454.0, 13558.0], [1466.0, 13910.0], [1462.0, 13790.0], [1458.0, 12935.0], [1530.0, 12731.0], [1534.0, 11940.0], [1506.0, 12070.0], [1510.0, 11982.0], [1514.0, 12251.0], [1526.0, 12128.0], [1522.0, 11956.0], [1502.0, 13312.0], [1474.0, 13733.0], [1478.0, 12729.0], [1486.0, 13977.0], [1482.0, 12722.0], [1498.0, 13097.0], [1494.0, 13514.0], [1490.0, 14015.0], [1518.0, 11957.0], [1570.0, 11514.0], [1578.0, 8880.0], [1582.0, 7877.666666666666], [1598.0, 8961.0], [1574.0, 11907.0], [1594.0, 8208.0], [1590.0, 7564.333333333334], [1586.0, 8293.5], [1566.0, 12727.0], [1538.0, 11975.0], [1542.0, 12825.0], [1546.0, 12812.0], [1550.0, 12479.0], [1562.0, 11444.0], [1558.0, 12686.0], [1554.0, 12059.0], [1658.0, 6737.4], [1610.0, 8577.5], [1662.0, 11934.0], [1634.0, 11123.0], [1650.0, 10895.0], [1614.0, 12097.0], [1654.0, 8449.5], [1642.0, 11268.0], [1638.0, 11320.0], [1646.0, 11742.0], [1606.0, 8629.5], [1602.0, 6565.166666666666], [1626.0, 11096.0], [1618.0, 12006.0], [1630.0, 12053.0], [1674.0, 11355.0], [1678.0, 9136.0], [1666.0, 7701.5], [1694.0, 11662.0], [1670.0, 9410.5], [1718.0, 8332.666666666666], [1714.0, 11233.0], [1722.0, 8999.5], [1726.0, 7980.5], [1682.0, 10564.0], [1686.0, 10721.0], [1690.0, 7606.0], [1702.0, 9006.5], [1698.0, 12797.0], [1706.0, 11544.0], [1710.0, 11494.0], [1734.0, 7709.0], [1786.0, 13543.0], [1754.0, 7088.333333333333], [1758.0, 10446.0], [1750.0, 8272.5], [1746.0, 10394.0], [1730.0, 8238.333333333334], [1738.0, 11286.333333333334], [1742.0, 8503.5], [1790.0, 6938.0], [1778.0, 10857.0], [1770.0, 7839.0], [1766.0, 10920.0], [1762.0, 10412.0], [1774.0, 12012.0], [1798.0, 6615.2], [1802.0, 7315.8], [1794.0, 5359.0], [1822.0, 7715.2], [1818.0, 10071.0], [1810.0, 9871.0], [1814.0, 9912.0], [1854.0, 10248.0], [1850.0, 11902.0], [1846.0, 12931.0], [1842.0, 13078.0], [1806.0, 10604.0], [1830.0, 10281.0], [1826.0, 9913.0], [1834.0, 9614.0], [1838.0, 8223.0], [1858.0, 10181.0], [1866.0, 8223.5], [1870.0, 7608.0], [1862.0, 12693.0], [1886.0, 7568.25], [1882.0, 9838.0], [1878.0, 8005.0], [1874.0, 9533.0], [1906.0, 9363.0], [1914.0, 7661.5], [1890.0, 9910.0], [1894.0, 9821.0], [1898.0, 9815.0], [1918.0, 9565.0], [1910.0, 7552.0], [1902.0, 9678.0], [1930.0, 8121.0], [1922.0, 8259.0], [1950.0, 9043.0], [1926.0, 8636.5], [1958.0, 9188.0], [1954.0, 10804.0], [1978.0, 10202.0], [1982.0, 10440.0], [1974.0, 9046.0], [1934.0, 9405.0], [1970.0, 7834.8], [1962.0, 8638.5], [1966.0, 8202.5], [1938.0, 9243.0], [1942.0, 9298.0], [1946.0, 7719.5], [1990.0, 8898.0], [2038.0, 7274.25], [1986.0, 9751.0], [1994.0, 10991.5], [2014.0, 11412.0], [2010.0, 9519.0], [1998.0, 8187.5], [2002.0, 10169.0], [2006.0, 8800.0], [2018.0, 8851.0], [2046.0, 9456.0], [2042.0, 7672.0], [2034.0, 8014.5], [2022.0, 9615.0], [2026.0, 7602.0], [2030.0, 8731.0], [2148.0, 7712.0], [2052.0, 7726.5], [2068.0, 8477.0], [2060.0, 7891.0], [2076.0, 10382.0], [2156.0, 8192.0], [2164.0, 9515.0], [2172.0, 8386.0], [2116.0, 8179.0], [2124.0, 9681.0], [2132.0, 8213.0], [2140.0, 8750.0], [2084.0, 8005.0], [2092.0, 8350.0], [2100.0, 8504.0], [2108.0, 8494.5], [2188.0, 7528.5], [2180.0, 7429.0], [2196.0, 8293.0], [2069.0, 7819.0], [2077.0, 7756.0], [2101.0, 8338.333333333334], [2053.0, 8455.0], [2061.0, 9506.0], [2109.0, 8108.0], [2149.0, 8386.0], [2157.0, 8051.5], [2165.0, 9328.0], [2117.0, 7341.0], [2173.0, 6820.0], [2085.0, 8182.0], [2093.0, 7570.0], [2125.0, 7901.0], [2133.0, 8800.0], [2141.0, 7826.0], [2181.0, 8472.5], [2197.0, 7785.0], [2189.0, 8078.0], [1035.0, 14927.0], [1087.0, 15685.0], [1079.0, 7605.666666666666], [1059.0, 15917.0], [1063.0, 14812.0], [1055.0, 14830.0], [1027.0, 14967.0], [1031.0, 16218.0], [1039.0, 15667.0], [1051.0, 15816.0], [1047.0, 14956.0], [1043.0, 15522.0], [1075.0, 9066.0], [1083.0, 15333.0], [1071.0, 14804.0], [1103.0, 15625.0], [1107.0, 7502.333333333334], [1099.0, 9723.0], [1095.0, 15218.0], [1139.0, 13706.0], [1151.0, 9553.0], [1147.0, 14954.0], [1143.0, 15112.0], [1123.0, 9182.0], [1127.0, 15405.0], [1131.0, 15008.0], [1135.0, 15020.0], [1111.0, 15136.0], [1115.0, 15558.0], [1119.0, 15162.0], [1091.0, 15282.0], [1163.0, 11439.666666666666], [1159.0, 8434.5], [1155.0, 9002.5], [1183.0, 8699.0], [1179.0, 14622.0], [1175.0, 7398.333333333334], [1167.0, 6749.5], [1187.0, 14964.0], [1191.0, 14384.0], [1215.0, 8914.0], [1207.0, 9462.0], [1211.0, 14210.0], [1203.0, 9206.5], [1195.0, 9745.5], [1199.0, 15183.0], [1171.0, 5964.2], [1227.0, 14811.0], [1247.0, 7892.666666666666], [1223.0, 14929.0], [1219.0, 14622.0], [1231.0, 14408.0], [1267.0, 14083.0], [1271.0, 8862.5], [1259.0, 9688.5], [1263.0, 9254.0], [1255.0, 13639.0], [1251.0, 14436.0], [1275.0, 13924.0], [1235.0, 14022.0], [1239.0, 14075.0], [1243.0, 13910.0], [1295.0, 10001.5], [1339.0, 6969.5], [1283.0, 9016.5], [1287.0, 14215.0], [1291.0, 13959.0], [1311.0, 5471.0], [1307.0, 7666.0], [1343.0, 7511.0], [1335.0, 6624.0], [1331.0, 9721.0], [1315.0, 9128.0], [1319.0, 6397.2], [1323.0, 13612.0], [1327.0, 9639.5], [1299.0, 14376.0], [1303.0, 8061.666666666666], [1351.0, 14432.0], [1347.0, 9019.5], [1355.0, 14453.0], [1375.0, 9247.0], [1371.0, 13108.0], [1367.0, 7307.75], [1403.0, 14310.0], [1407.0, 9436.5], [1359.0, 12845.0], [1395.0, 13723.0], [1399.0, 13344.0], [1383.0, 9083.0], [1387.0, 13721.0], [1391.0, 13561.0], [1379.0, 9517.5], [1363.0, 8290.0], [1415.0, 7773.333333333334], [1463.0, 14004.0], [1431.0, 8115.333333333334], [1435.0, 14067.0], [1439.0, 14231.0], [1427.0, 9593.0], [1411.0, 13467.0], [1419.0, 9320.0], [1423.0, 12950.0], [1459.0, 13810.0], [1471.0, 12885.0], [1443.0, 13240.0], [1447.0, 13520.0], [1451.0, 12896.0], [1455.0, 12755.0], [1531.0, 12524.0], [1535.0, 12527.0], [1507.0, 12780.0], [1511.0, 12153.0], [1515.0, 12239.0], [1527.0, 12456.0], [1523.0, 12428.0], [1503.0, 12640.0], [1475.0, 12548.0], [1479.0, 13339.0], [1483.0, 12731.0], [1487.0, 13531.0], [1499.0, 12369.0], [1495.0, 13679.0], [1491.0, 12995.0], [1519.0, 12197.0], [1595.0, 9153.5], [1599.0, 6555.6], [1571.0, 11698.0], [1575.0, 8999.0], [1579.0, 7279.0], [1583.0, 8645.0], [1591.0, 7357.6], [1587.0, 8935.5], [1567.0, 12058.0], [1539.0, 12386.0], [1543.0, 13244.0], [1547.0, 12553.0], [1551.0, 13080.0], [1563.0, 11774.0], [1559.0, 12097.0], [1555.0, 11875.0], [1659.0, 10636.0], [1615.0, 8730.5], [1607.0, 9419.0], [1663.0, 8571.0], [1655.0, 10879.0], [1651.0, 11431.0], [1647.0, 12068.0], [1635.0, 8259.0], [1639.0, 11901.0], [1643.0, 11682.0], [1611.0, 12397.0], [1603.0, 8334.5], [1631.0, 11816.0], [1623.0, 10810.666666666666], [1619.0, 11453.0], [1627.0, 9194.5], [1667.0, 11365.0], [1723.0, 11318.0], [1675.0, 10709.0], [1671.0, 11882.0], [1679.0, 11695.0], [1695.0, 11114.0], [1691.0, 11660.0], [1687.0, 11703.0], [1683.0, 11738.0], [1727.0, 5040.0], [1719.0, 7625.0], [1711.0, 8387.666666666666], [1707.0, 11542.0], [1703.0, 10297.0], [1699.0, 11579.0], [1715.0, 10888.0], [1759.0, 8902.0], [1747.0, 10944.0], [1751.0, 9993.0], [1755.0, 11034.0], [1735.0, 6876.25], [1731.0, 11331.0], [1739.0, 7328.333333333333], [1743.0, 10566.0], [1787.0, 8354.5], [1783.0, 10252.5], [1779.0, 10094.0], [1763.0, 7536.333333333333], [1767.0, 10632.0], [1771.0, 10840.0], [1775.0, 10928.0], [1791.0, 10122.0], [1799.0, 7078.5], [1803.0, 7598.25], [1823.0, 10475.0], [1819.0, 10389.0], [1811.0, 10418.0], [1815.0, 10297.0], [1795.0, 9056.0], [1807.0, 8086.0], [1855.0, 9854.0], [1851.0, 8688.0], [1847.0, 10982.0], [1843.0, 10293.0], [1831.0, 8911.5], [1827.0, 11889.0], [1835.0, 11266.0], [1839.0, 7330.333333333333], [1859.0, 8405.666666666666], [1863.0, 10134.0], [1887.0, 8862.333333333334], [1883.0, 9144.0], [1879.0, 9493.0], [1875.0, 10019.0], [1867.0, 8116.5], [1871.0, 7682.0], [1907.0, 9583.0], [1911.0, 7117.75], [1915.0, 8186.0], [1919.0, 9548.0], [1891.0, 9878.0], [1895.0, 9815.0], [1899.0, 7568.333333333333], [1903.0, 7905.333333333333], [1927.0, 8009.0], [1947.0, 9291.0], [1951.0, 9247.0], [1923.0, 11068.0], [1959.0, 9163.0], [1955.0, 10364.0], [1979.0, 8990.0], [1983.0, 11480.0], [1975.0, 7793.0], [1971.0, 7746.75], [1935.0, 9343.0], [1931.0, 12035.0], [1963.0, 9128.0], [1967.0, 9065.0], [1939.0, 7911.0], [1943.0, 8599.0], [1991.0, 8864.0], [1999.0, 7585.0], [1987.0, 8058.5], [1995.0, 8844.0], [2015.0, 8822.0], [2003.0, 9689.0], [2007.0, 8797.0], [2019.0, 8960.5], [2043.0, 9282.0], [2047.0, 8030.0], [2039.0, 8900.5], [2035.0, 9379.0], [2023.0, 8755.0], [2027.0, 7869.0], [2031.0, 8710.0], [2150.0, 9424.0], [2070.0, 8527.0], [2062.0, 9194.0], [2054.0, 9167.0], [2078.0, 8698.0], [2158.0, 8564.0], [2166.0, 7575.0], [2174.0, 9189.0], [2118.0, 8617.0], [2126.0, 7242.333333333333], [2134.0, 8575.0], [2142.0, 7758.0], [2094.0, 9175.0], [2102.0, 8088.666666666667], [2110.0, 7590.0], [2182.0, 7594.0], [2198.0, 7359.0], [2190.0, 6680.0], [2079.0, 8930.0], [2055.0, 8876.0], [2063.0, 8733.0], [2071.0, 8782.0], [2111.0, 9419.5], [2151.0, 8310.0], [2159.0, 7941.0], [2167.0, 8271.0], [2175.0, 8292.0], [2119.0, 9827.0], [2087.0, 7535.8], [2095.0, 8999.0], [2103.0, 7980.666666666667], [2127.0, 8416.0], [2135.0, 9214.0], [2183.0, 8631.5], [2199.0, 7870.0], [2191.0, 7603.0], [1.0, 20575.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1179.3773333333286, 12487.80233333334]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2202.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 4756.483333333334, "minX": 1.54961856E12, "maxY": 15737.433333333332, "series": [{"data": [[1.54961856E12, 5310.516666666666], [1.54961862E12, 15737.433333333332]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961856E12, 4756.483333333334], [1.54961862E12, 14093.516666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961862E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 4764.301188903569, "minX": 1.54961856E12, "maxY": 15094.44092732947, "series": [{"data": [[1.54961856E12, 4764.301188903569], [1.54961862E12, 15094.44092732947]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961862E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 4764.284015852051, "minX": 1.54961856E12, "maxY": 15094.436469014692, "series": [{"data": [[1.54961856E12, 4764.284015852051], [1.54961862E12, 15094.436469014692]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961862E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 74.69484808454429, "minX": 1.54961856E12, "maxY": 83.61346411056616, "series": [{"data": [[1.54961856E12, 74.69484808454429], [1.54961862E12, 83.61346411056616]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961862E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 532.0, "minX": 1.54961856E12, "maxY": 23349.0, "series": [{"data": [[1.54961856E12, 8957.0], [1.54961862E12, 23349.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961856E12, 532.0], [1.54961862E12, 3216.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961856E12, 7018.000000000001], [1.54961862E12, 20503.7]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961856E12, 8433.079999999994], [1.54961862E12, 21567.96]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961856E12, 7576.8], [1.54961862E12, 20878.85]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961862E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 4871.0, "minX": 12.0, "maxY": 14965.0, "series": [{"data": [[37.0, 14965.0], [12.0, 4871.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 37.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 4871.0, "minX": 12.0, "maxY": 14965.0, "series": [{"data": [[37.0, 14965.0], [12.0, 4871.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 37.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 2.2666666666666666, "minX": 1.54961856E12, "maxY": 47.733333333333334, "series": [{"data": [[1.54961856E12, 47.733333333333334], [1.54961862E12, 2.2666666666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961862E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 12.616666666666667, "minX": 1.54961856E12, "maxY": 37.38333333333333, "series": [{"data": [[1.54961856E12, 12.616666666666667], [1.54961862E12, 37.38333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961862E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 12.616666666666667, "minX": 1.54961856E12, "maxY": 37.38333333333333, "series": [{"data": [[1.54961856E12, 12.616666666666667], [1.54961862E12, 37.38333333333333]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961862E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
